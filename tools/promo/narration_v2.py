"""Generate clear, friendly female narration and its real word timings."""
import asyncio,json,hashlib,argparse
from pathlib import Path
import edge_tts
ROOT=Path(__file__).resolve().parents[2]
parser=argparse.ArgumentParser()
parser.add_argument('--story',type=Path,default=Path(__file__).with_name('storyboard-v2.json'))
parser.add_argument('--output',type=Path,default=ROOT/'.tmp-validation/promo-v2/narration')
args=parser.parse_args()
story=json.loads(args.story.read_text(encoding='utf-8'))
out=args.output
out.mkdir(parents=True,exist_ok=True)
async def main():
    for scene in story['scenes']:
        key=hashlib.sha256(json.dumps([scene['text'],story['voice']],ensure_ascii=False).encode()).hexdigest()
        marker=out/f'{scene["id"]}.key';audio=out/f'{scene["id"]}.mp3';meta=out/f'{scene["id"]}.jsonl'
        if marker.exists() and marker.read_text()==key and audio.exists() and meta.exists():continue
        v=story['voice']
        await edge_tts.Communicate(scene['text'],voice=v['name'],rate=v['rate'],pitch=v['pitch'],boundary='WordBoundary').save(str(audio),str(meta))
        marker.write_text(key)
        print('narration ready:',scene['id'],flush=True)
asyncio.run(main())
