import argparse
import json
import os

from compare_locales.parser import getParser, Junk
from compare_locales.parser.fluent import FluentEntity
from compare_locales import mozpath
import hglib
from hglib.util import b, cmdbuilder


class Blame:
    def __init__(self, client, cwd=None):
        self.client = client
        self._cwd = cwd
        self.users = []
        self.blame = {}

    @property
    def cwd(self):
        if self._cwd is None:
            return self.client.root()
        else:
            return mozpath.join(self.client.root(), self._cwd.encode("utf-8"))

    def file_path_relative(self, file_path):
        if self._cwd is None:
            return file_path
        check_val = f"{self._cwd}"
        if file_path.startswith(check_val):
            return file_path[len(check_val)+1:]
        return file_path

    def attribution(self, file_paths):
        args = cmdbuilder(
            b('annotate'), *[b(p) for p in file_paths], template='json',
            date=True, user=True, cwd=self.cwd)
        blame_json = self.client.rawcommand(args)
        file_blames = json.loads(blame_json)

        for file_blame in file_blames:
            self.handleFile(file_blame)

        return {'authors': self.users,
                'blame': self.blame}

    def handleFile(self, file_blame):
        path = mozpath.normsep(self.file_path_relative(file_blame['path']))

        try:
            parser = getParser(path)
        except UserWarning:
            return

        self.blame[path] = {}

        self.readFile(parser, path)
        entities = parser.parse()
        for e in entities:
            if isinstance(e, Junk):
                continue
            if e.val_span:
                key_vals = [(e.key, e.val_span)]
            else:
                key_vals = []
            if isinstance(e, FluentEntity):
                key_vals += [
                    (f'{e.key}.{attr.key}', attr.val_span)
                    for attr in e.attributes
                ]
            for key, (val_start, val_end) in key_vals:
                entity_lines = file_blame['lines'][
                    (e.ctx.linecol(val_start)[0] - 1):e.ctx.linecol(val_end)[0]
                ]
                # ignore timezone
                entity_lines.sort(key=lambda blame: -blame['date'][0])
                line_blame = entity_lines[0]
                user = line_blame['user']
                timestamp = line_blame['date'][0]  # ignore timezone
                if user not in self.users:
                    self.users.append(user)
                userid = self.users.index(user)
                self.blame[path][key] = [userid, timestamp]

    def readFile(self, parser, path):
        parser.readFile(os.path.join(self.cwd.decode('utf-8'), path))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('repo_path')
    parser.add_argument('file_path', nargs='+')
    args = parser.parse_args()
    blame = Blame(hglib.open(args.repo_path))
    attrib = blame.attribution(args.file_path)
    print(json.dumps(attrib, indent=4, separators=(',', ': ')))
