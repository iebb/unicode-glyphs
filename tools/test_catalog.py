#!/usr/bin/env python3
"""Check that draft membership is based on released codepoint presence."""
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from build_catalog import build


class CatalogTests(unittest.TestCase):
    def test_only_new_draft_characters_are_red(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            root.joinpath('README.md').write_text('Fixture catalog')
            for channel,cps in [('release',[65]),('draft',[65,66])]:
                reports=root/'reports'/channel;reports.mkdir(parents=True)
                with gzip.open(reports/'compressed-manifest.jsonl.gz','wt') as f:
                    for cp in cps:
                        row={'codepoint':f'{cp:04X}','path':f'U00/00/{cp:02X}.svgz',
                             'source_identifier':None,'page':2,'fonts':['Fixture'],
                             'dotted_circle':False,'name':f'TEST {cp}','block':'Test block','category':'Lu'}
                        f.write(json.dumps(row)+'\n')
            root.joinpath('reports/release/summary.json').write_text(json.dumps({'svg_files':1,'codepoints':1,'expected_codepoints':1,'noncharacter_reference_codepoints':0}))
            root.joinpath('reports/release/compression.json').write_text('{}')
            build(root,{'release':{'version':'18.0.0'},'draft':{'version':'19.0.0'}})
            shard=json.loads(root.joinpath('docs/data/shards/0000.json').read_text())
            self.assertFalse(shard['41']['d'])
            self.assertTrue(shard['42']['d'])
            self.assertEqual(shard['41']['v'][0][0],'U00/00/41.svgz')
            self.assertEqual(shard['41']['w'][0][0],'draft/U00/00/41.svgz')
            self.assertEqual(shard['42']['v'][0][0],'draft/U00/00/42.svgz')
            self.assertEqual(json.loads(root.joinpath('docs/data/catalog.json').read_text())['draft_codepoints'],1)
            self.assertIn('class="draft"',root.joinpath('docs/browse/0.html').read_text())


if __name__=='__main__':unittest.main()
