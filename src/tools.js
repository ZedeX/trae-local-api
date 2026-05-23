const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '';
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_SEARCH_RESULTS = 5;
const SEARCH_TIMEOUT = 15000;

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the content of a file from the local filesystem. Supports absolute paths and relative paths (relative to workspace directory).',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path to read. Can be absolute or relative to workspace directory.'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file on the local filesystem. Creates directories if needed. Supports absolute paths and relative paths.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path to write. Can be absolute or relative to workspace directory.'
          },
          content: {
            type: 'string',
            description: 'Content to write to the file.'
          },
          append: {
            type: 'boolean',
            description: 'If true, append to file instead of overwriting. Default: false.'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories in a given path. Returns file names, sizes, and modification times.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to list. Default: workspace directory.'
          },
          pattern: {
            type: 'string',
            description: 'Optional glob-like pattern to filter files (e.g. "*.md", "src/**/*.js").'
          },
          recursive: {
            type: 'boolean',
            description: 'If true, list files recursively. Default: false.'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_internet',
      description: 'Search the internet for information. Returns search results with titles, URLs, and snippets. Use this when you need up-to-date information or facts not in your training data.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string.'
          },
          num_results: {
            type: 'integer',
            description: 'Number of results to return. Default: 5, Max: 10.'
          }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fetch_url',
      description: 'Fetch the content of a web page and return it as text. Useful for reading web articles or documentation.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to fetch.'
          },
          max_length: {
            type: 'integer',
            description: 'Maximum content length to return in characters. Default: 5000.'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: 'Execute a shell command and return its output. Use with caution - only for safe, read-only operations like dir, type, git status, etc.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command to execute.'
          },
          timeout: {
            type: 'integer',
            description: 'Timeout in milliseconds. Default: 10000.'
          }
        },
        required: ['command']
      }
    }
  }
];

function resolveFilePath(inputPath) {
  if (path.isAbsolute(inputPath)) return inputPath;
  if (WORKSPACE_DIR) return path.join(WORKSPACE_DIR, inputPath);
  return path.resolve(inputPath);
}

async function executeReadFile(args) {
  const filePath = resolveFilePath(args.path);
  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${args.path}` };
  }
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return { error: `Path is a directory, not a file: ${args.path}` };
  }
  if (stat.size > MAX_FILE_SIZE) {
    return { error: `File too large (${Math.round(stat.size / 1024)}KB, max ${MAX_FILE_SIZE / 1024 / 1024}MB): ${args.path}` };
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return {
      path: args.path,
      absolute_path: filePath,
      size: stat.size,
      content: content
    };
  } catch (e) {
    return { error: `Failed to read file: ${e.message}` };
  }
}

async function executeWriteFile(args) {
  const filePath = resolveFilePath(args.path);
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (args.append) {
      fs.appendFileSync(filePath, args.content, 'utf-8');
    } else {
      fs.writeFileSync(filePath, args.content, 'utf-8');
    }
    const stat = fs.statSync(filePath);
    return {
      path: args.path,
      absolute_path: filePath,
      size: stat.size,
      action: args.append ? 'appended' : 'written'
    };
  } catch (e) {
    return { error: `Failed to write file: ${e.message}` };
  }
}

async function executeListFiles(args) {
  const dirPath = resolveFilePath(args.path || '.');
  if (!fs.existsSync(dirPath)) {
    return { error: `Directory not found: ${args.path || '.'}` };
  }
  if (!fs.statSync(dirPath).isDirectory()) {
    return { error: `Path is not a directory: ${args.path || '.'}` };
  }

  const files = [];
  const pattern = args.pattern || '';
  const recursive = args.recursive || false;

  function walkDir(dir, base) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (recursive) {
          walkDir(fullPath, relPath);
        } else {
          files.push({ name: entry.name, path: relPath, type: 'directory' });
        }
      } else {
        if (!pattern || matchPattern(relPath, pattern)) {
          const stat = fs.statSync(fullPath);
          files.push({
            name: entry.name,
            path: relPath,
            type: 'file',
            size: stat.size,
            modified: stat.mtime.toISOString()
          });
        }
      }
    }
  }

  walkDir(dirPath, '');
  return { directory: args.path || '.', files: files, total: files.length };
}

function matchPattern(filePath, pattern) {
  if (!pattern) return true;
  const lower = filePath.toLowerCase();
  const pat = pattern.toLowerCase();
  if (pat.startsWith('*.')) {
    return lower.endsWith(pat.substring(1));
  }
  if (pat.includes('**')) {
    const parts = pat.split('**');
    return lower.includes(parts[0].toLowerCase()) && lower.includes(parts[parts.length - 1].toLowerCase());
  }
  return lower.includes(pat);
}

async function executeSearchInternet(args) {
  const query = args.query;
  const numResults = Math.min(args.num_results || MAX_SEARCH_RESULTS, 10);

  const duckDuckUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve({ error: `Search timed out after ${SEARCH_TIMEOUT}ms`, query: query });
    }, SEARCH_TIMEOUT);

    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || process.env.https_proxy || process.env.http_proxy || process.env.all_proxy;

    const doFetch = (url, mod) => {
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        timeout: SEARCH_TIMEOUT,
      };

      if (proxyUrl) {
        try {
          if (proxyUrl.startsWith('socks')) {
            const { SocksProxyAgent } = require('socks-proxy-agent');
            options.agent = new SocksProxyAgent(proxyUrl);
          } else {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            options.agent = new HttpsProxyAgent(proxyUrl);
          }
        } catch (e) { }
      }

      const req = mod.get(url, options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
          clearTimeout(timer);
          const results = parseDuckDuckGoHtml(data, numResults);
          resolve({ query: query, results: results });
        });
      });

      req.on('error', (e) => {
        clearTimeout(timer);
        resolve({ error: `Search failed: ${e.message}`, query: query });
      });

      req.on('timeout', () => {
        clearTimeout(timer);
        req.destroy();
        resolve({ error: `Search timed out`, query: query });
      });
    };

    doFetch(duckDuckUrl, https);
  });
}

function parseDuckDuckGoHtml(html, maxResults) {
  const results = [];
  const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  const urls = [];
  const titles = [];
  let match;

  while ((match = resultRegex.exec(html)) !== null && urls.length < maxResults) {
    urls.push(match[1]);
    titles.push(match[2].replace(/<[^>]+>/g, '').trim());
  }

  const snippets = [];
  while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
  }

  for (let i = 0; i < urls.length; i++) {
    results.push({
      title: titles[i] || '',
      url: urls[i] || '',
      snippet: snippets[i] || ''
    });
  }

  return results;
}

async function executeFetchUrl(args) {
  const url = args.url;
  const maxLength = args.max_length || 5000;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ error: `Fetch timed out`, url: url });
    }, SEARCH_TIMEOUT);

    const mod = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,text/plain,application/json',
      },
      timeout: SEARCH_TIMEOUT,
    };

    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || process.env.https_proxy || process.env.http_proxy || process.env.all_proxy;

    if (proxyUrl) {
      try {
        if (proxyUrl.startsWith('socks')) {
          const { SocksProxyAgent } = require('socks-proxy-agent');
          options.agent = new SocksProxyAgent(proxyUrl);
        } else {
          const { HttpsProxyAgent } = require('https-proxy-agent');
          options.agent = new HttpsProxyAgent(proxyUrl);
        }
      } catch (e) { }
    }

    const req = mod.get(url, options, (resp) => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        clearTimeout(timer);
        return executeFetchUrl({ url: resp.headers.location, max_length: maxLength })
          .then(resolve).catch(() => resolve({ error: `Redirect failed`, url: url }));
      }

      let data = '';
      resp.on('data', chunk => {
        data += chunk;
        if (data.length > 500000) {
          resp.destroy();
        }
      });
      resp.on('end', () => {
        clearTimeout(timer);
        const text = htmlToText(data);
        resolve({
          url: url,
          status: resp.statusCode,
          content_type: resp.headers['content-type'] || '',
          content: text.substring(0, maxLength)
        });
      });
    });

    req.on('error', (e) => {
      clearTimeout(timer);
      resolve({ error: `Fetch failed: ${e.message}`, url: url });
    });

    req.on('timeout', () => {
      clearTimeout(timer);
      req.destroy();
      resolve({ error: `Fetch timed out`, url: url });
    });
  });
}

function htmlToText(html) {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.trim();
  return text;
}

async function executeCommand(args) {
  const { exec } = require('child_process');
  const command = args.command;
  const timeout = args.timeout || 10000;

  const blocked = ['rm ', 'del ', 'format ', 'shutdown', 'rmdir', 'rd /s', 'mkfs', 'dd if=', '> /dev/', 'rm -rf', 'del /f /s'];
  const lowerCmd = command.toLowerCase();
  for (const b of blocked) {
    if (lowerCmd.includes(b)) {
      return { error: `Command blocked for safety: contains "${b.trim()}"` };
    }
  }

  return new Promise((resolve) => {
    exec(command, { timeout, maxBuffer: 1024 * 1024, cwd: WORKSPACE_DIR || undefined }, (error, stdout, stderr) => {
      if (error) {
        return resolve({
          error: `Command failed: ${error.message}`,
          stdout: stdout ? stdout.substring(0, 3000) : '',
          stderr: stderr ? stderr.substring(0, 1000) : '',
          exit_code: error.code || 1
        });
      }
      resolve({
        stdout: stdout ? stdout.substring(0, 5000) : '',
        stderr: stderr ? stderr.substring(0, 1000) : '',
        exit_code: 0
      });
    });
  });
}

const TOOL_EXECUTORS = {
  'read_file': executeReadFile,
  'write_file': executeWriteFile,
  'list_files': executeListFiles,
  'search_internet': executeSearchInternet,
  'fetch_url': executeFetchUrl,
  'execute_command': executeCommand,
};

async function executeTool(name, args) {
  const executor = TOOL_EXECUTORS[name];
  if (!executor) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    return await executor(args || {});
  } catch (e) {
    return { error: `Tool execution error: ${e.message}` };
  }
}

function getToolDefinitions(toolNames) {
  if (!toolNames || toolNames.length === 0) {
    return TOOL_DEFINITIONS;
  }
  return TOOL_DEFINITIONS.filter(t => toolNames.includes(t.function.name));
}

function getToolSystemPrompt() {
  return `You are an AI assistant with access to the following tools:

1. **read_file** - Read file contents from the local filesystem
2. **write_file** - Write content to files (create or overwrite)
3. **list_files** - List files and directories
4. **search_internet** - Search the internet for information
5. **fetch_url** - Fetch and read web page content
6. **execute_command** - Execute shell commands (read-only operations)

When the user's request requires using these tools, call the appropriate tool(s) to fulfill the request. For example:
- "Read the file report.md" -> call read_file
- "Search for the latest news about AI" -> call search_internet
- "List all Python files in the project" -> call list_files with pattern "*.py"
- "Save this summary to summary.md" -> call write_file
- "What does this URL say?" -> call fetch_url
- "What's the current directory structure?" -> call execute_command with "dir" or "ls"

Important rules:
- Always use tools when the user's request involves file operations, web searches, or command execution
- For file paths, you can use relative paths (relative to workspace: ${WORKSPACE_DIR || 'current directory'}) or absolute paths
- After reading a file or getting search results, analyze the content and provide a helpful response
- When writing files, include the complete content the user requested
- Do NOT make up file contents - always read files first if you need to reference them
- You may call multiple tools in a single response if they are independent of each other`;
}

module.exports = {
  TOOL_DEFINITIONS,
  TOOL_EXECUTORS,
  executeTool,
  getToolDefinitions,
  getToolSystemPrompt,
};
