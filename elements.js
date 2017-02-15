
const TRANSITION_TIME = 300;

function afterTime(opt_duration) {
  return new Promise((resolve, reject) => {
    window.setTimeout(_ => resolve(), opt_duration || TRANSITION_TIME);
  });
}

class GemCell extends HTMLElement {
  static get observedAttributes() {
    return ['color'];
  }

  constructor() {
    super();

    const root = this.attachShadow({mode: 'closed'});
    root.innerHTML = `
<style>
:host {
  display: inline-block;
  transform-style: preserve-3d;
  width: 1em;
  height: 1em;
}
#cell {
  will-change: transform, opacity;
  display: inline-block;
  width: 94%;
  height: 94%;
  margin: 3%;
  box-sizing: border-box;
  border-radius: 0.075em;
  background: white;
  opacity: 0.66;
  cursor: pointer;
  background: #888;
  transition: transform 0.125s;
  transform: scale(1);
}
#cell:not(.appear) {
  transform: scale(0);
}
#shadow {
  pointer-events: none;
  opacity: 0;
  top: 8%;
  left: 8%;
  position: absolute;
  display: inline-block;
  width: 84%;
  height: 84%;
  border-radius: 0.075em;
  background: white;
  filter: blur(0.05em);
  transition: opacity 0.125s;
  will-change: opacity;
}
:host(:focus) #shadow {
  opacity: 0.125;
}
:host(:focus) #cell {
  transform: translateZ(0.25em);
}
#cell.fall {
  transition: transform 2.5s, opacity 1.5s;
  transition-timing-function: ease-out;
  opacity: 0;
}
#cell::after {
  position: absolute;
  content: '';
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  outline: none;
  z-index: -100;
  border-radius: inherit;
  border: 0.1em solid white;
  opacity: 0;
  will-change: opacity;
}
:host(:focus) {
  outline: none;
}
:host(:focus) #cell::after {
  opacity: 1;
}
</style>
<div id="shadow"></div>
<div id="cell"></div>
    `;

    this.cell_ = root.getElementById('cell');

    const choices = ['#999', '#c77', '#7c7', '#77c']
    const choice = Math.random() * choices.length | 0;
    this.color = choices[choice];

  }

  set color(v) {
    if (v) {
      this.setAttribute('color', v)
    } else {
      this.removeAttribute('color');
    }
  }

  get color() {
    return this.getAttribute('color');
  }

  attributeChangedCallback(attrName, oldValue, newValue) {
    this.cell_.style.background = this.color || null;
  }

  appear() {
    if (this.cell_.classList.contains('appear')) {
      return Promise.resolve(true);
    }
    this.cell_.offsetLeft;
    this.cell_.classList.add('appear');
    return afterTime(250);
  }

  fall(opt_after) {
    return new Promise((resolve, reject) => {
      afterTime(2500).then(_ => {
        this.cell_.style.transform = '';
        this.cell_.className = '';
      }).then(resolve);

      const rotA = (Math.random() * 120) - 60;
      const rotB = (Math.random() * 60) - 30;
      const m = `translateZ(-10em) rotateX(-90deg) rotateZ(${rotA}deg) rotateZ(${rotB}deg)`;

      this.cell_.style.transform = m;
      this.cell_.classList.add('fall');
    });
  }

  equalTo(other) {
    return other && other.color === this.color;
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
  background: rgba(0, 0, 0, 0.125);
  border: 0.5em solid transparent;
  border-radius: 0.5em;
  position: relative;
  transform-style: preserve-3d;
}
#board gem-cell {
  position: absolute;
  transition: transform 0.25s;
}
#board gem-cell:focus {
  z-index: 1000;
}
</style>
<div id="board"></div>
    `;

    this.boardEl_ = root.getElementById('board');

    let initialFocus = false;
    let active = null;
    let start = null;

    this.boardEl_.addEventListener('pointerdown', ev => {
      if (!this.toDef_.has(ev.target)) { return; }
      active = ev.target;

      if (ev.target === root.activeElement) {
        initialFocus = true;
      } else {
        active.focus();
        initialFocus = false;
      }

      start = {x: ev.screenX, y: ev.screenY};
    });
    this.boardEl_.addEventListener('pointerup', ev => {
      if (!initialFocus && active) {
        active.blur();
      }
      active = null;
      start = null;
    });

    this.boardEl_.addEventListener('pointermove', ev => {
      if (!start) {
        return;
      }

      const delta = {x: ev.screenX - start.x, y: ev.screenY - start.y};
      const factor = 6;  // TODO: factor should be fn of em
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

      if (!initialFocus) {
        const local = active;
        window.setTimeout(_ => local.blur(), TRANSITION_TIME);
      }

      active = null;
      start = null;
    }, true);
    this.resize_();
  }

  /**
   * @return {!Promise} promise that resolves when all queued ticks are completed
   */
  tick_() {
    if (this.ticking_) { return this.ticking_; }

    let totalMatches = 0;
    const internalTick = _ => {
      const matches = this.match_();
      totalMatches += matches.size;

      // fun GA logging of matches
      const byColor = {};
      matches.forEach(cell => {
        byColor[cell.color] = (byColor[cell.color] || 0) + 1;
      });
      for (let color in byColor) {
        ga('send', 'event', 'board', 'match', color, byColor[color]);
      }
      ga('send', 'event', 'board', 'match', '*', matches.size);

      if (!matches.size) {
        this.ticking_ = null;
        return totalMatches;  // this will resolve internal tick
      }

      return this.removeCells_(matches)
          .then(_ => afterTime(TRANSITION_TIME))
          .then(_ => this.fill_())  // should probably never give matches, but we should be safe
          .then(internalTick);
    };

    return this.ticking_ = afterTime().then(internalTick);
  }

  removeCells_(cells) {
    let i = 0;

    const all = [...cells];
    all.sort((a, b) => Math.random() - 0.5);  // randomly remove

    all.forEach(cell => {
      const def = this.toDef_.get(cell);
      const idx = this.idx_(def);
      this.toDef_.delete(cell);
      this.grid_[idx] = null;

      afterTime(i++ * 50).then(_ => {
        cell.removeAttribute('tabindex');  // TODO: fall focus first
        return cell.fall();
      }).then(_ => cell.remove());
    });

    return afterTime(i * 50);
  }

  destroy() {
    if (this.ticking_) { return false; }
    this.ticking_ = this.removeCells_(this.toDef_.keys()).then(_ => {
      this.ticking_ = null;
    });
  }

  /**
   * Check if placing the cell at the specified pos would cause a match.
   * @param {!GemCell} cell
   * @param {{x: number, y: number}} pos
   * @return {boolean}
   */
  wouldMatch_(cell, pos) {
    const walk = (dx, dy) => {
      let local = {x: pos.x, y: pos.y};
      for (let i = 0;; ++i) {
        local.x += dx;
        local.y += dy;
        const nextCell = this.at_(local);
        if (!cell.equalTo(nextCell)) {
          return i;
        }
      }
    };
    return (walk(+1, 0) + walk(-1, 0)) >= 2 || (walk(0, +1) + walk(0, -1)) >= 2;
  }

  /**
   * @return {!Set<!GemCell>} set of cells that are members of at least one row or column of three
   */
  match_() {
    const matched = new Set();
    const dim = this.dim;

    for (let x = 0; x < this.dim; ++x) {
      for (let y = 0; y < this.dim; ++y) {
        const cell = this.at_({x, y});
        if (cell == null) { continue; }

        for (let dx = 1, dy = 0; dx >= 0 && dy <= 1; --dx, ++dy) {
          const run = [];
          let ox = x;
          let oy = y;
          for (;;) {
            const nextCell = this.at_({x: ox, y: oy});
            if (!cell.equalTo(nextCell)) { break; }
            run.push(nextCell);
            ox += dx;
            oy += dy;
          }
          if (run.length >= 3) {
            for (let i = 0; i < run.length; ++i)  {
              matched.add(run[i]);
            }
          }
        }
      }
    }

    return matched;
  }

  fill_(allowMatches) {
    const dim = this.dim;

    let i = 0;
    const p = [];

    for (let x = 0; x < this.dim; ++x) {
      for (let y = 0; y < this.dim; ++y) {
        const pos = {x, y};
        if (this.at_(pos)) { continue; }

        let cell;
        for (let i = 0; i < 4; ++i) {  // limit attempts
          cell = new GemCell();
          if (allowMatches || !this.wouldMatch_(cell, pos)) {
            break;
          }
        }

        this.placeAt(pos, cell);

        const appear = afterTime(++i * 50).then(_ => cell.appear());
        p.push(appear);
      }
    }

    return Promise.all(p);
  }

  /**
   * @param {{x: number, y: number}} pos
   * @param {string} dir
   * @return {GemCell}
   */
  neighbourCell_(pos, dir) {
    let {x, y} = pos;

    switch (dir) {
    case 'up':
      --y;
      break;
    case 'down':
      ++y;
      break;
    case 'left':
      --x;
      break;
    case 'right':
      ++x;
      break;
    default:
      throw new TypeError('invalid dir: ' + dir);
    }

    console.info('looking at', x, y);
    return this.at_({x, y});
  }

  /**
   * @param {{x: number, y: number}} pos
   * @return {GemCell}
   */
  at_(pos) {
    const idx = this.idx_(pos);
    return this.grid_[idx];
  }

  /**
   * Moves the passed cell in the given direction, if possible.
   *
   * @param {GemCell} cell
   * @param {string} dir
   * @return {boolean} if the gem was moved
   */
  move(cell, dir) {
    if (this.ticking_) {
      return false;
    }

    const def = this.toDef_.get(cell);
    if (!def) { return false; }

    const other = this.neighbourCell_(def, dir);
    if (!other) {
      // TODO(samthor): If this is a valid (but empty?) cell, should we swap into it?
      return false;
    }

    this.swap_(cell, other);
    this.tick_();
    return true;
  }

  /**
   * @param {!GemCell} a
   * @param {!GemCell} b
   * @return {!Promise<!Array<!GemCell>>}
   */
  swap_(a, b) {
    if (a === b) {
      return;
    }

    const defA = this.toDef_.get(a);
    const idxA = this.idx_(defA);
    const defB = this.toDef_.get(b);
    const idxB = this.idx_(defB);

    this.grid_[idxA] = b;
    this.toDef_.set(a, defB);
    this.grid_[idxB] = a;
    this.toDef_.set(b, defA);

    const aP = this.positionCell_(defB, a);
    const bP = this.positionCell_(defA, b);

    return Promise.all([aP, bP]);
  }

  /**
   * @param {{x: number, y: number}} pos
   * @param {!GemCell} cell
   * @return {!Promise<!GemCell>}
   */
  positionCell_(pos, cell) {
    let duration = TRANSITION_TIME;

    if (cell.parentNode !== this.boardEl_) {
      this.boardEl_.appendChild(cell);
      duration = 0;
    }

    cell.style.transition = `transform ${duration}ms`;
    cell.style.transform = `translate(${pos.x}em, ${pos.y}em)`;

    return afterTime(duration);
  }

  /**
   * @param {{x: number, y: number}} pos
   * @param {GemCell} cell
   */
  placeAt(pos, cell) {
    const idx = this.idx_(pos);
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
    this.positionCell_(pos, cell);
    cell.tabIndex = 100 + idx;

    const def = prevDef || {};
    ({x: def.x, y: def.y} = pos);
    prevDef || this.toDef_.set(cell, def);
    this.grid_[idx] = cell;

    return prev;
  }

  /**
   * @param {{x: number, y: number}} pos
   * @return {number} index inside grid array, or -1 for bad
   */
  idx_(pos) {
    const dim = this.dim;
    const {x, y} = pos;
    if (x < 0 || y < 0 || x >= dim || y >= dim) {
      return -1;
    }
    return y * dim + x;
  }

  resize_() {
    const dim = this.dim;
    this.grid_ = new Array(dim * dim);
    this.grid_.fill(null);
    this.boardEl_.style.width = `${dim}em`;
    this.boardEl_.style.height = `${dim}em`;
    this.toDef_ = new Map();
    this.ticking_ = null;
    this.fill_();
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