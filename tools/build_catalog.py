#!/usr/bin/env python3
"""Build compact search indexes, codepoint shards and static navigation pages."""
import argparse
from collections import defaultdict
import gzip
import html
import json
from pathlib import Path
import re
import shutil


def write_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')


def rows(repo,channel):
    with gzip.open(repo/'reports'/channel/'compressed-manifest.jsonl.gz','rt') as src:
        for line in src:yield json.loads(line)


def build(repo,discovery):
    docs=repo/'docs'; data=docs/'data'
    if data.exists():shutil.rmtree(data)
    records={};blocks=defaultdict(list)
    for channel in ('release','draft'):
        if not discovery.get(channel):continue
        for row in rows(repo,channel):
            cp=int(row['codepoint'],16)
            path=('draft/' if channel=='draft' else '')+row['path']
            specimen=[path,row['source_identifier'],row['page'],row['fonts'],
                      row['dotted_circle'],row.get('specimen_kind','glyph')]
            if cp not in records:
                records[cp]={'c':cp,'n':row['name'] or 'Noncharacter',
                             'b':row['block'],'t':row['category'],'v':[],'d':channel=='draft'}
            record=records[cp]
            if channel=='draft' and not record['d']:
                record.setdefault('w',[]).append(specimen)
            else:record['v'].append(specimen)
    shards=defaultdict(dict);search=[]
    for cp,record in sorted(records.items()):
        key=f'{cp:06X}'[:4];shards[key][f'{cp:X}']=record
        search.append([cp,record['n'],record['b'],record['d']])
        blocks[record['b']].append(cp)
    for key,items in shards.items():write_json(data/'shards'/f'{key}.json',items)
    write_json(data/'search.json',search)
    block_index=[]
    for i,(name,cps) in enumerate(sorted(blocks.items(),key=lambda pair:min(pair[1]))):
        entry={'id':str(i),'name':name,'first':min(cps),'last':max(cps),'count':len(cps),
               'draft':sum(records[cp]['d'] for cp in cps)}
        block_index.append(entry);write_json(data/'blocks'/f'{i}.json',cps)
    stable=json.loads((repo/'reports/release/summary.json').read_text())
    compressed=json.loads((repo/'reports/release/compression.json').read_text())
    meta={'release':discovery['release'],'draft':discovery['draft'],
          'codepoints':len(records),'draft_codepoints':sum(r['d'] for r in records.values()),
          'svg_files':stable['svg_files'],'blocks':block_index,
          'planes':sorted({cp>>16 for cp in records}),
          'compression':compressed,'format':'svgz','schema':1}
    write_json(data/'catalog.json',meta)
    readme=repo/'README.md'
    text=readme.read_text()
    text=re.sub(r'The Unicode [\d.]+ snapshot contains [\d,]+ specimens for all [\d,]+ printed\nchart codepoints\. This includes [\d,]+ assigned non-private-use, non-surrogate\ncodepoints and [\d,]+ noncharacter conventions\.',
                f'The Unicode {discovery["release"]["version"]} snapshot contains {stable["svg_files"]:,} specimens for all {stable["codepoints"]:,} printed\nchart codepoints. This includes {stable["expected_codepoints"]:,} assigned non-private-use, non-surrogate\ncodepoints and {stable["noncharacter_reference_codepoints"]:,} noncharacter conventions.',text)
    readme.write_text(text)
    # Every GitHub directory gets a usable navigation page, including variants.
    notice='**Reference only. Restrictive source font licenses apply. No reuse or redistribution rights are granted.**'
    groups=defaultdict(list)
    for cp,r in records.items():
        groups[f'U{cp>>16:02X}/{(cp>>8)&255:02X}'].append((cp,r))
    for key,items in groups.items():
        folder=repo/key;folder.mkdir(parents=True,exist_ok=True)
        text=[f'# {key} reference specimens','',notice,'',
              '[Open the glyph browser](https://iebb.github.io/unicode-glyphs/) · [Source terms](../../REFERENCE-ONLY.md)','',
              '| Codepoint | Name | Forms |','| --- | --- | --- |']
        for cp,r in sorted(items):
            tail=f'{cp&255:02X}'
            variants=r['v'];draft=r['d']
            if not draft:
                if len(variants)>1:
                    target=folder/tail;target.mkdir(exist_ok=True)
                    detail=[f'# U+{cp:04X} — {r["n"]}','',notice,'',
                            f'[View all forms](https://iebb.github.io/unicode-glyphs/#cp={cp:X})','',
                            '| Specimen | PDF page |','| --- | --- |']
                    detail += [f'| [{html.escape(v[1] or Path(v[0]).stem)}]({Path(v[0]).name}) | {v[2]} |' for v in variants]
                    (target/'README.md').write_text('\n'.join(detail)+'\n')
                    link=tail+'/'
                else:link=tail+'.svgz'
            else:link=f'https://iebb.github.io/unicode-glyphs/#cp={cp:X}'
            text.append(f'| [U+{cp:04X}]({link})'+(' 🔴 Draft' if draft else '')+f' | {r["n"]} | {len(variants)} |')
        (folder/'README.md').write_text('\n'.join(text)+'\n')
    for plane in meta['planes']:
        prefix=f'U{plane:02X}';folder=repo/prefix;folder.mkdir(exist_ok=True)
        links=[f'- [{key.split("/")[1]}]({key.split("/")[1]}/) — {len(items):,} codepoints'
               for key,items in sorted(groups.items()) if key.startswith(prefix+'/')]
        (folder/'README.md').write_text(f'# Unicode plane {plane}\n\n{notice}\n\n'+'\n'.join(links)+'\n')
    nav=docs/'browse';nav.mkdir(exist_ok=True)
    for b in block_index:
        title=html.escape(b['name'])
        content=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} — Unicode reference</title><link rel="stylesheet" href="../style.css"><body><main class="document"><a href="../">← Glyph browser</a><p class="eyebrow">UNICODE REFERENCE / BLOCK {b['id']}</p><h1>{title}</h1><p class="warning">Reference only. Restrictive source font licenses apply. No reuse or redistribution rights are granted.</p><p>{b['count']:,} codepoints · U+{b['first']:04X}–U+{b['last']:04X}</p><a class="primary-link" href="../#block={b['id']}">Explore specimens →</a><ul>'''
        content+=''.join(f'<li><a href="../#cp={cp:X}"'+(' class="draft"' if records[cp]['d'] else '')+f'>U+{cp:04X} — {html.escape(records[cp]["n"])}'+(' · Draft' if records[cp]['d'] else '')+'</a></li>' for cp in blocks[b['name']])
        (nav/f'{b["id"]}.html').write_text(content+'</ul></main></body></html>')
    # Render an index usable without JavaScript, preserving the same licensed notice.
    links=''.join(f'<li><a href="browse/{b["id"]}.html">{html.escape(b["name"])}</a> <small>{b["count"]:,}</small></li>' for b in block_index)
    (docs/'navigation.html').write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>All Unicode blocks</title><link rel="stylesheet" href="style.css"><main class="document"><a href="./">← Glyph browser</a><h1>All Unicode blocks</h1><p class="warning">{notice.replace("**","")}</p><ul>{links}</ul></main></html>')
    print(f'Built {len(records):,} codepoints, {len(shards)} shards, {len(block_index)} blocks')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1])
    p.add_argument('--discovery',type=Path,required=True)
    args=p.parse_args();build(args.repo,json.loads(args.discovery.read_text()))
