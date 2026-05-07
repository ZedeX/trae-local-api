import json
import os
import sys
import time
from mitmproxy import http

SAVE_DIR = r'd:\_program\Trae\zx-test\captured'
os.makedirs(SAVE_DIR, exist_ok=True)

class TraeCapture:
    def request(self, flow: http.HTTPFlow):
        host = flow.request.pretty_host
        if 'trae.ai' in host or 'mchost.guru' in host:
            url = flow.request.pretty_url
            method = flow.request.method
            body_text = flow.request.get_text() or ''
            
            if 'create_agent_task' in url:
                ts = int(time.time())
                fname = f"req_{ts}_{len(os.listdir(SAVE_DIR))}"
                fpath = os.path.join(SAVE_DIR, fname)
                
                save_data = {
                    'method': method,
                    'url': url,
                    'headers': dict(flow.request.headers),
                    'body_length': len(body_text)
                }
                
                try:
                    body_json = json.loads(body_text)
                    save_data['body_keys'] = list(body_json.keys())
                    
                    for key in body_json:
                        val = body_json[key]
                        if isinstance(val, (str, int, float, bool)) or val is None:
                            save_data[f'body_{key}'] = val
                        elif isinstance(val, list):
                            save_data[f'body_{key}_count'] = len(val)
                            if len(val) > 0 and isinstance(val[0], dict):
                                save_data[f'body_{key}_0_keys'] = list(val[0].keys())
                        elif isinstance(val, dict):
                            save_data[f'body_{key}_keys'] = list(val.keys())
                    
                    with open(fpath + '.json', 'w', encoding='utf-8') as f:
                        json.dump(save_data, f, indent=2, ensure_ascii=False, default=str)
                    
                    with open(fpath + '.full', 'w', encoding='utf-8') as f:
                        f.write(body_text)
                    
                    print(f"\n{'='*60}")
                    print(f"CAPTURED: {method} {url}")
                    print(f"  Body length: {len(body_text)}")
                    print(f"  Body keys: {list(body_json.keys())}")
                    print(f"  Saved to: {fname}")
                    print(f"{'='*60}")
                except Exception as e:
                    with open(fpath + '.raw', 'w', encoding='utf-8') as f:
                        f.write(body_text)
                    print(f"Parse error: {e}, saved raw ({len(body_text)} bytes)")
            elif 'get_detail_param' in url:
                ts = int(time.time())
                fname = f"detail_{ts}_{len(os.listdir(SAVE_DIR))}"
                fpath = os.path.join(SAVE_DIR, fname)
                
                with open(fpath + '.full', 'w', encoding='utf-8') as f:
                    f.write(body_text)
                print(f"  get_detail_param saved ({len(body_text)} bytes)")

    def response(self, flow: http.HTTPFlow):
        host = flow.request.pretty_host
        if 'trae.ai' in host or 'mchost.guru' in host:
            if 'create_agent_task' in flow.request.pretty_url:
                ts = int(time.time())
                fname = f"resp_{ts}_{len(os.listdir(SAVE_DIR))}"
                fpath = os.path.join(SAVE_DIR, fname)
                
                body = flow.response.get_text()
                if body:
                    with open(fpath + '.resp', 'w', encoding='utf-8') as f:
                        f.write(body[:50000])
                    print(f"  Response saved ({len(body)} bytes, status: {flow.response.status_code})")

addons = [TraeCapture()]
