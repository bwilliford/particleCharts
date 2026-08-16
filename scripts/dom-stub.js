/**
 * A DOM + Canvas2D stub, just complete enough to run the library headlessly.
 * Only the surface Particle Charts actually touches is implemented — anything
 * else on the 2D context resolves to a no-op through a Proxy.
 */

const NOOP = () => {};

class StubClassList {
  constructor() {
    this.set = new Set();
  }
  add(...names) {
    names.forEach((n) => this.set.add(n));
  }
  remove(...names) {
    names.forEach((n) => this.set.delete(n));
  }
  contains(name) {
    return this.set.has(name);
  }
}

class StubElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.classList = new StubClassList();
    this.listeners = {};
    this._text = '';
    this._html = '';
    this._rect = null;
  }

  /** Tests set `__rect` on a host; descendants inherit it lazily up the tree. */
  set __rect(rect) {
    this._rect = rect;
  }
  get __rect() {
    if (this._rect) return this._rect;
    if (this.parentNode) return this.parentNode.__rect;
    return { width: 600, height: 320, left: 0, top: 0 };
  }

  get className() {
    return this._class || '';
  }
  set className(v) {
    this._class = v;
  }

  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
    if (v === '') this.childNodes = [];
  }

  get innerHTML() {
    return this._html;
  }
  set innerHTML(v) {
    this._html = String(v);
  }

  get offsetWidth() {
    return Math.round(this.__rect.width);
  }
  get offsetHeight() {
    return Math.round(this.__rect.height);
  }
  get clientWidth() {
    return Math.round(this.__rect.width);
  }
  get clientHeight() {
    return Math.round(this.__rect.height);
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this.listeners[type];
    if (list) this.listeners[type] = list.filter((f) => f !== fn);
  }
  getBoundingClientRect() {
    const r = this.__rect;
    return { width: r.width, height: r.height, left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height };
  }
}

class StubCanvas extends StubElement {
  constructor() {
    super('canvas');
    this.width = 300;
    this.height = 150;
  }
  getContext() {
    if (!this._ctx) this._ctx = makeContext();
    return this._ctx;
  }
  toDataURL(type) {
    return 'data:' + (type || 'image/png') + ';base64,';
  }
}

function makeContext() {
  const state = {
    filter: 'none',
    font: '10px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    textAlign: 'start',
    textBaseline: 'alphabetic'
  };

  const impl = {
    measureText(text) {
      // ~6px per character at 11px — close enough for layout maths.
      const size = parseFloat(state.font) || 11;
      return { width: String(text).length * size * 0.55 };
    },
    createRadialGradient() {
      return { addColorStop: NOOP };
    },
    createLinearGradient() {
      return { addColorStop: NOOP };
    },
    getImageData() {
      return { data: [255, 255, 255, 255] };
    },
    save: NOOP,
    restore: NOOP
  };

  return new Proxy(state, {
    get(target, prop) {
      if (prop in impl) return impl[prop];
      if (prop in target) return target[prop];
      return NOOP;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    has() {
      return true;
    }
  });
}

export function installDomStub() {
  const head = new StubElement('head');
  const body = new StubElement('body');
  const registry = new Map();

  const document = {
    head,
    body,
    visibilityState: 'visible',
    createElement(tag) {
      return String(tag).toLowerCase() === 'canvas' ? new StubCanvas() : new StubElement(tag);
    },
    getElementById(id) {
      return registry.get(id) || null;
    },
    querySelector() {
      return null;
    },
    addEventListener: NOOP,
    removeEventListener: NOOP
  };

  // Track injected <style id> so injectStyles() only runs once, as in a browser.
  const realAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    if (child.id) registry.set(child.id, child);
    return realAppend(child);
  };

  const queue = [];
  let nextId = 1;

  global.document = document;
  global.window = { devicePixelRatio: 2 };
  global.requestAnimationFrame = (fn) => {
    const id = nextId++;
    queue.push({ id, fn });
    return id;
  };
  global.cancelAnimationFrame = (id) => {
    const i = queue.findIndex((q) => q.id === id);
    if (i >= 0) queue.splice(i, 1);
  };
  global.matchMedia = () => ({ matches: false, addEventListener: NOOP, removeEventListener: NOOP });

  /** Run every pending frame callback with the given timestamp. */
  global.__flushFrame = (time) => {
    const pending = queue.splice(0, queue.length);
    for (const { fn } of pending) fn(time);
    return pending.length;
  };

  return { document, StubElement, StubCanvas };
}
