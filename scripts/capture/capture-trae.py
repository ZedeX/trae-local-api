import asyncio
import json
import os
from mitmproxy import http

OUTPUT_DIR = r"D:\_program\Trae\zx-test\captures"
os.makedirs(OUTPUT_DIR, exist_ok=True)

request_count = 0

class TraeCapture:
    def __init__(self):
        self.request_count = 0

    def request(self, flow: http.HTTPFlow):
        host = flow.request.pretty_host
        if 'mchost.guru' in host or 'trae.ai' in host or 'trae-api' in host:
            self.request_count += 1
            req_id = f"req_{self.request_count:04d}"
            
            req_data = {
                'id': req_id,
                'method': flow.request.method,
                'url': flow.request.pretty_url,
                'headers': dict(flow.request.headers),
                'content_length': len(flow.request.content) if flow.request.content else 0,
            }
            
            if flow.request.content:
                try:
                    body = json.loads(flow.request.content)
                    req_data['body'] = body
                    
                    if 'create_agent_task' in flow.request.pretty_url:
                        filename = f"{req_id}_create_agent_task_req.json"
                        filepath = os.path.join(OUTPUT_DIR, filename)
                        with open(filepath, 'w', encoding='utf-8') as f:
                            json.dump(req_data, f, indent=2, ensure_ascii=False)
                        print(f"[CAPTURED] {req_id} {flow.request.method} {flow.request.pretty_url} ({len(flow.request.content)} bytes) -> {filename}")
                    else:
                        filename = f"{req_id}_other_req.json"
                        filepath = os.path.join(OUTPUT_DIR, filename)
                        with open(filepath, 'w', encoding='utf-8') as f:
                            json.dump(req_data, f, indent=2, ensure_ascii=False)
                        print(f"[CAPTURED] {req_id} {flow.request.method} {flow.request.pretty_url} ({len(flow.request.content)} bytes)")
                except json.JSONDecodeError:
                    req_data['body_raw'] = flow.request.content.decode('utf-8', errors='replace')[:2000]
                    filename = f"{req_id}_nonjson_req.json"
                    filepath = os.path.join(OUTPUT_DIR, filename)
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(req_data, f, indent=2, ensure_ascii=False)
                    print(f"[CAPTURED] {req_id} {flow.request.method} {flow.request.pretty_url} (non-JSON)")

    def response(self, flow: http.HTTPFlow):
        host = flow.request.pretty_host
        if 'mchost.guru' in host or 'trae.ai' in host or 'trae-api' in host:
            if 'create_agent_task' in flow.request.pretty_url:
                req_id = f"resp_{self.request_count:04d}"
                resp_data = {
                    'id': req_id,
                    'url': flow.request.pretty_url,
                    'status_code': flow.response.status_code,
                    'headers': dict(flow.response.headers),
                    'content_type': flow.response.headers.get('content-type', ''),
                }
                
                content_type = flow.response.headers.get('content-type', '')
                if 'text/event-stream' in content_type:
                    if flow.response.content:
                        resp_data['sse_content'] = flow.response.content.decode('utf-8', errors='replace')[:50000]
                    resp_data['note'] = 'SSE response - content may be truncated'
                elif 'application/json' in content_type:
                    try:
                        resp_data['body'] = json.loads(flow.response.content)
                    except:
                        resp_data['body_raw'] = flow.response.content.decode('utf-8', errors='replace')[:5000]
                else:
                    if flow.response.content:
                        resp_data['body_raw'] = flow.response.content.decode('utf-8', errors='replace')[:5000]

                filename = f"{req_id}_create_agent_task_resp.json"
                filepath = os.path.join(OUTPUT_DIR, filename)
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(resp_data, f, indent=2, ensure_ascii=False)
                print(f"[RESPONSE] {req_id} {flow.response.status_code} for {flow.request.pretty_url}")

addons = [TraeCapture()]
