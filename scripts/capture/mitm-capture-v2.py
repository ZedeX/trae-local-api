import json
import os
from mitmproxy import http

SAVE_DIR = 'd:/_program/Trae/zx-test/captured'
os.makedirs(SAVE_DIR, exist_ok=True)

class TraeCapture:
    def request(self, flow: http.HTTPFlow):
        if 'trae.ai' in flow.request.pretty_host or 'mchost.guru' in flow.request.pretty_host:
            url = flow.request.pretty_url
            method = flow.request.method
            body_text = flow.request.get_text() or ''
            
            print(f"\n{'='*60}")
            print(f"REQUEST: {method} {url}")
            
            if 'create_agent_task' in url:
                fname = f"req_create_agent_{len(os.listdir(SAVE_DIR))}.json"
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
                    save_data['body_preview'] = {k: str(v)[:200] for k, v in body_json.items()}
                    
                    if 'messages' in body_json:
                        save_data['messages_count'] = len(body_json['messages'])
                        save_data['messages_roles'] = [m.get('role', '?') for m in body_json['messages']]
                    
                    for key in ['model_name', 'config_name', 'model', 'mode_type', 'agent_type', 
                                'session_id', 'task_id', 'message_id', 'conversation_id',
                                'device_id', 'ide_version', 'user_id']:
                        if key in body_json:
                            save_data[f'body_{key}'] = body_json[key]
                    
                    with open(fpath, 'w', encoding='utf-8') as f:
                        json.dump(save_data, f, indent=2, ensure_ascii=False)
                    
                    with open(fpath + '.full', 'w', encoding='utf-8') as f:
                        f.write(body_text)
                    
                    print(f"  SAVED to {fname}")
                    print(f"  Body keys: {list(body_json.keys())}")
                    print(f"  model_name: {body_json.get('model_name')}")
                    print(f"  config_name: {body_json.get('config_name')}")
                    print(f"  mode_type: {body_json.get('mode_type')}")
                    print(f"  agent_type: {body_json.get('agent_type')}")
                    print(f"  Body length: {len(body_text)}")
                except:
                    with open(fpath + '.raw', 'w', encoding='utf-8') as f:
                        f.write(body_text)
                    print(f"  Saved raw body ({len(body_text)} bytes)")
            else:
                print(f"  (not create_agent_task, skipping save)")
            
            print(f"{'='*60}")

    def response(self, flow: http.HTTPFlow):
        if 'trae.ai' in flow.request.pretty_host or 'mchost.guru' in flow.request.pretty_host:
            if 'create_agent_task' in flow.request.pretty_url:
                print(f"\nRESPONSE: {flow.request.method} {flow.request.pretty_url}")
                print(f"  Status: {flow.response.status_code}")
                body = flow.response.get_text()
                if body:
                    print(f"  Body (first 300): {body[:300]}")

addons = [TraeCapture()]
