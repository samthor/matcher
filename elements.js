
class GemCell extends HTMLElement {
  static get observedAttributes() {
    return ['dim'];
  }

  constructor(color) {
    super();

    const root = this.attachShadow({mode: 'closed'});
    root.innerHTML = `
<style>
:host {
  display: inline-block;
  transform-style: preserve-3d;
}
#cell {
  will-change: transform;
  position: absolute;
  display: inline-block;
  width: 0.95em;
  height: 0.95em;
  margin: 0.025em;
  box-sizing: border-box;
  border-radius: 0.075em;
  background: white;
  opacity: 0.66;
  cursor: pointer;
}
#cell.fall {
  transition: transform 2.5s, opacity 1.5s;
  transition-timing-function: ease-out;
  transform: translateZ(-10em) rotateX(-90deg);
  opacity: 0;
}
:host(:focus) {
  outline: none;
}
:host(:focus) #cell::after {
  position: absolute;
  content: '';
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  outline: none;
  z-index: -100;
  border-radius: inherit;
  border: .15em solid white;
}
</style>
<div id="cell"></div>
    `;

    const cell = root.getElementById('cell');
    cell.style.background = color || 'pink';
    this.cell_ = cell;
    this.color = color;

    this.cell_.addEventListener('transitionend', ev => {
      this.cell_.className = '';
    });
  }

  fall() {
    this.cell_.classList.add('fall');
  }

  equalTo(other) {
    return other && other.color === color;
  }
}

class GemBoard extends HTMLElement {
  static get observedAttributes() {
    return ['dim'];
  }

  constructor() {
    super();

    const root = this.attachShadow({mode: 'closed'});
    root.innerHTML = `
<style>
:host {
  display: inline-block;
  transform-style: preserve-3d;
}
#board {
  position: relative;
  transform-style: preserve-3d;
}
#board gem-cell {
  position: absolute;
  transition: transform 0.25s;
}
</style>
<div id="board">
  
</div>
    `;

    this.boardEl_ = root.getElementById('board');

    let active = null;
    let start = null;

    this.boardEl_.addEventListener('pointermove', ev => {
      if (ev.pressure < 0.1) {
        active = null;
        return;
      }

      const curr = {x: ev.screenX, y: ev.screenY};

      if (active === null) {
        if (ev.target !== root.activeElement) { return; }
        if (!this.toDef_.has(ev.target)) { return; }

        active = ev.target;
        start = curr;
        return;
      }

      const factor = 12;  // TODO: factor should be fn of em
      const delta = {x: curr.x - start.x, y: curr.y - start.y};
      let dir = null;
      if (delta.x > factor) {
        if (delta.y > factor) {
          dir = 'right';
        } else if (delta.y < -factor) {
          dir = 'up';
        }
      } else if (delta.x < -factor) {
        if (delta.y > factor) {
          dir = 'down';
        } else if (delta.y < -factor) {
          dir = 'left';
        }
      }
      if (!dir) { return; }

      this.move(active, dir);
      active = null;
    });
    this.resize_();
  }

  offsetFor_(dir) {
    switch (dir) {
    case 'up':
      return {x: 0, y: -1};
    case 'down':
      return {x: 0, y: +1};
    case 'left':
      return {x: -1, y: 0};
    case 'right':
      return {x: +1, y: 0};
    }
    return {x: 0, y: 0};
  }

  move(cell, dir) {
    const def = this.toDef_.get(cell);
    if (!def) { return null; }

    const {x: dx, y: dy} = this.offsetFor_(dir);
    const {ox, oy} = {ox: def.x + dx, oy: def.y + dy};

    const idx = this.idx_(ox, oy);
    if (idx < 0) { return undefined; }

    const other = this.grid_[idx];
    if (!other) {
      return this.placeAt(ox, oy, cell);
    }

    this.swap_(cell, other);
    return other;
  }

  /**
   * @param {GemCell} a
   * @param {GemCell} b
   */
  swap_(a, b) {
    if (a === b) {
      return;
    }

    const ad = this.toDef_.get(a);
    const bd = this.toDef_.get(b);

    const tx = ad.x, ty = ad.y;
    ad.x = bd.x;
    ad.y = bd.y;
    bd.x = tx;
    bd.y = ty;

    this.placeCell_(ad.x, ad.y, a);
    this.placeCell_(bd.x, bd.y, b);
  }

  placeCell_(x, y, cell) {
    // TODO: set transition time based on distance
    const idx = this.idx_(x, y);
    if (idx < 0) {
      throw new TypeError('can\'t place at invalid idx');
    }

    const def = this.toDef_.get(cell);
    let steps = 0;
    if (def) {
      steps = Math.sqrt(Math.pow(def.x - x, 2) + Math.pow(def.y - y, 2));
    }
    const duration = steps * 250;

    if (cell.parentNode !== this.boardEl_) {
      this.boardEl_.appendChild(cell);
      steps = 0;
    }
    cell.style.transform = `translate(${x}em, ${y}em)`;
    cell.style.transition = `transform ${duration}ms`;
    cell.tabIndex = 100 + idx;

    this.grid_[idx] = cell;

    return new Promise((resolve, reject) => {
      window.setTimeout(_ => resolve(cell), duration);
    });
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {GemCell} cell
   */
  placeAt(x, y, cell) {
    const idx = this.idx_(x, y);
    if (idx < 0) { return undefined; }

    // clear previous cell at new location
    const prev = this.grid_[idx];
    if (prev) {
      prev.remove();
      this.toDef_.delete(prev);
      this.grid_[idx] = null;
    }

    // setup new cell
    if (!cell) {
      return prev;
    } else if (!(cell instanceof GemCell)) {
      throw new TypeError('expected GemCell');
    }

    // clear previous grid loc, if applicable
    const prevDef = this.toDef_.get(cell);
    if (prevDef) {
      const prevIdx = this.idx_(prevDef.x, prevDef.y);
      this.grid_[prevIdx] = null;
    }

    // position cell at location
    this.placeCell_(x, y, cell);

    const def = prevDef || {};
    def.x = x;
    def.y = y;
    prevDef || this.toDef_.set(cell, def);
    this.grid_[idx] = cell;

    return prev;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {number} index inside grid array, or -1 for bad
   */
  idx_(x, y) {
    const dim = this.dim;
    if (x < 0 || y < 0 || x >= dim || y >= dim) {
      return -1;
    }
    return y * dim + x;
  }

  resize_() {
    const dim = this.dim;
    this.grid_ = new Array(dim * dim);
    this.boardEl_.style.width = `${dim}em`;
    this.boardEl_.style.height = `${dim}em`;
    this.toDef_ = new Map();
  }

  attributeChangedCallback(attrName, oldValue, newValue) {
    this.resize_();
  }

  get dim() {
    return +this.getAttribute('dim') || 6;
  }

}

customElements.define('gem-board', GemBoard);
customElements.define('gem-cell', GemCell);