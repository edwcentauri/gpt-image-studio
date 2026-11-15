const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const source = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1]
  .replace(/\(async function initialize\(\) \{[\s\S]*?\}\)\(\);/, '');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const selectIds = new Set(['model', 'size', 'quality', 'moderation', 'background', 'outputFormat', 'outputCompression', 'ratio', 'imageSize']);

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(name, force) { if (force) this.values.add(name); else this.values.delete(name); }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.isSelect = selectIds.has(id);
    this.options = [];
    this.children = [];
    this._value = '';
    this.checked = false;
    this.hidden = false;
    this.disabled = false;
    this.type = id === 'removeWatermark' || id === 'saveKey' ? 'checkbox' : '';
    this.classList = new FakeClassList();
    this.style = {};
    this.dataset = {};
    this.parents = new Map();
    this.clientWidth = 800;
    this.clientHeight = 600;
  }
  get value() {
    return this._value;
  }
  set value(next) {
    const value = String(next ?? '');
    this._value = this.isSelect && this.options.length && !this.options.some((option) => option.value === value) ? '' : value;
  }
  replaceChildren(...children) {
    this.children = children;
    if (this.isSelect) {
      this.options = children;
      if (children.length && !children.some((option) => option.value === this._value)) this._value = children[0].value;
    }
  }
  closest(selector) {
    if (!this.parents.has(selector)) this.parents.set(selector, new FakeElement());
    return this.parents.get(selector);
  }
  addEventListener() {}
  setAttribute() {}
  appendChild() {}
  append() {}
  remove() {}
  focus() {}
  scrollIntoView() {}
}

function createApp(saved = {}) {
  const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement(id)]));
  elements.model.options = ['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'].map((value) => ({ value, text: value }));
  elements.model.value = 'gpt-image-2';
  elements.outputFormat.value = 'png';
  const storage = new Map(Object.entries(saved).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
  const context = {
    console,
    AbortController,
    Blob,
    Uint8Array,
    Option: class Option { constructor(text, value) { this.text = text; this.value = value; } },
    document: {
      getElementById: (id) => elements[id],
      createElement: () => new FakeElement(),
      body: new FakeElement('body'),
      addEventListener() {},
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    location: { href: 'https://example.test/' },
    performance: { now: () => 0 },
    setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; },
    clearTimeout,
    setInterval: (...args) => { const timer = setInterval(...args); timer.unref(); return timer; },
    clearInterval,
    queueMicrotask,
    fetch: async () => { throw new Error('Unexpected fetch'); },
  };
  context.window = { addEventListener() {}, crypto: { randomUUID: () => 'test-id' } };
  vm.createContext(context);
  new vm.Script(source, { filename: 'inline-app.js' }).runInContext(context);
  return { context, elements, storage };
}

test('只保留各系列生图模型，排除聊天与视频模型', () => {
  const { context } = createApp();
  const matches = (model, provider) => context.modelMatchesProvider(model, provider);
  assert.equal(matches('gpt-image-3', 'gpt'), true);
  assert.equal(matches('gpt-4o', 'gpt'), false);
  assert.equal(matches('gemini-4-flash-image', 'gemini'), true);
  assert.equal(matches('gemini-4-flash', 'gemini'), false);
  assert.equal(matches('seedream-6-0', 'seedream'), true);
  assert.equal(matches('wan2.8-image-pro', 'wan'), true);
  assert.equal(matches('wan2.8-video', 'wan'), false);
});

test('启动恢复上次模型，切换系列后仍分别保留选择', async () => {
  const { context, elements } = createApp({
    'gpt-image-studio': { provider: 'gpt', model: 'gpt-image-2.5-sunburst' },
  });
  await context.loadState();
  assert.equal(elements.model.value, 'gpt-image-2.5-sunburst');
  context.setProvider('wan', false);
  context.syncModelOptions(context.providerModels?.wan || ['wan2.7-image', 'wan2.7-image-pro'], 'wan2.7-image-pro');
  context.syncModelFields();
  context.setProvider('gpt', false);
  assert.equal(elements.model.value, 'gpt-image-2.5-sunburst');
  context.setProvider('wan', false);
  assert.equal(elements.model.value, 'wan2.7-image-pro');
});

test('Wan Pro 与图生图模式可在重启后一并恢复', async () => {
  const { context, elements } = createApp({
    'gpt-image-studio': { provider: 'wan', model: 'wan2.7-image-pro', mode: 'edit' },
  });
  await context.loadState();
  assert.equal(elements.model.value, 'wan2.7-image-pro');
  assert.equal(vm.runInContext('provider', context), 'wan');
  assert.equal(vm.runInContext('mode', context), 'edit');
  assert.equal(Array.from(elements.size.options, (option) => option.value).includes('4K'), false);
});

test('动态模型缓存可在重启后恢复', async () => {
  const { context, elements } = createApp({
    'gpt-image-studio': {
      provider: 'gpt',
      model: 'gpt-image-3',
      modelCache: { gpt: ['gpt-image-3', 'gpt-4o'] },
    },
  });
  await context.loadState();
  assert.equal(elements.model.value, 'gpt-image-3');
  assert.deepEqual(Array.from(elements.model.options, (option) => option.value).includes('gpt-4o'), false);
});

test('刷新模型使用 Models 接口并按系列更新，保留当前模型', async () => {
  const { context, elements } = createApp();
  await context.loadState();
  context.syncModelOptions(['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'], 'gpt-image-2.5-sunburst');
  context.syncModelFields();
  elements.apiKey.value = 'test-key';
  let requestedUrl = '';
  let authorization = '';
  context.fetch = async (url, options) => {
    requestedUrl = url;
    authorization = options.headers.Authorization;
    return { ok: true, json: async () => ({ data: [
      { id: 'gpt-image-3' }, { id: 'gpt-4o' },
      { id: 'gemini-4-flash-image' }, { id: 'gemini-4-flash' },
      { id: 'seedream-6-0' }, { id: 'wan2.8-image' }, { id: 'wan2.8-video' },
    ] }) };
  };
  assert.equal(await context.refreshModels(), true);
  assert.equal(requestedUrl, 'https://modelflare.dev/v1/models');
  assert.equal(authorization, 'Bearer test-key');
  const models = vm.runInContext('providerModels', context);
  assert.equal(models.gpt.includes('gpt-image-3'), true);
  assert.equal(models.gpt.includes('gpt-4o'), false);
  assert.equal(models.gemini.includes('gemini-4-flash-image'), true);
  assert.equal(models.gemini.includes('gemini-4-flash'), false);
  assert.equal(models.wan.includes('wan2.8-image'), true);
  assert.equal(models.wan.includes('wan2.8-video'), false);
  assert.equal(elements.model.value, 'gpt-image-2.5-sunburst');
});

test('模型检索失败时保留现有列表与选择', async () => {
  const { context, elements } = createApp();
  await context.loadState();
  context.syncModelOptions(['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'], 'gpt-image-2.5-sunburst');
  context.syncModelFields();
  elements.apiKey.value = 'test-key';
  context.fetch = async () => ({ ok: false, status: 500, json: async () => ({ message: 'failed' }) });
  assert.equal(await context.refreshModels({ silent: true }), false);
  assert.equal(elements.model.value, 'gpt-image-2.5-sunburst');
  assert.equal(Array.from(elements.model.options).length, 3);
});

test('Wan 文生图、单图与多图编辑请求符合各自契约', async () => {
  const { context, elements } = createApp();
  await context.loadState();
  context.setProvider('wan', false);
  elements.size.value = '2K';
  const generation = context.wanOptions('生成海报');
  assert.deepEqual(JSON.parse(JSON.stringify(generation)), {
    model: 'wan2.7-image', prompt: '生成海报', n: 1, watermark: false, size: '2K',
  });
  assert.equal('quality' in generation, false);
  assert.equal('output_format' in generation, false);
  const single = context.wanOptions('编辑图片', ['data:image/png;base64,abc']);
  assert.equal(single.image, 'data:image/png;base64,abc');
  const multiple = context.wanOptions('融合两张图片', ['https://example.test/a.png', 'https://example.test/b.png']);
  assert.equal(multiple.prompt, undefined);
  assert.equal(multiple.input.messages[0].content.length, 3);
  assert.equal(multiple.input.messages[0].content[0].image, 'https://example.test/a.png');
  assert.equal(multiple.input.messages[0].content[2].text, '融合两张图片');
  assert.equal(multiple.input.parameters.size, '2K');
  assert.equal(multiple.input.parameters.prompt_extend, true);
});

test('仅 Wan Pro 文生图显示 4K，新 Gemini 模型使用安全默认配置', async () => {
  const { context, elements } = createApp();
  await context.loadState();
  context.setProvider('wan', false);
  assert.equal(Array.from(elements.size.options, (option) => option.value).includes('4K'), false);
  context.syncModelOptions(['wan2.7-image', 'wan2.7-image-pro'], 'wan2.7-image-pro');
  context.syncModelFields();
  assert.equal(Array.from(elements.size.options, (option) => option.value).includes('4K'), true);
  context.setMode('edit', false);
  assert.equal(Array.from(elements.size.options, (option) => option.value).includes('4K'), false);
  vm.runInContext("providerModels.gemini.push('gemini-4-flash-image')", context);
  context.setProvider('gemini', false, 'gemini-4-flash-image');
  assert.equal(elements.model.value, 'gemini-4-flash-image');
  assert.equal(elements.ratio.options.length > 0, true);
});

test('Models 地址兼容以 /images 结尾的自定义地址', async () => {
  const { context, elements } = createApp();
  await context.loadState();
  elements.baseUrl.value = 'https://example.test/v1/images/';
  assert.equal(context.modelsEndpoint(), 'https://example.test/v1/models');
});
