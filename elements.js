
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
.cell {
  position: absolute;
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  margin: 0.075em;
  box-sizing: border-box;
  border-radius: 0.075em;
  background: white;
  opacity: 0.5;
  transition: transform 0.5s;
  cursor: pointer;
}
.cell:hover {
  box-shadow: 0 0 0 2px black;
}
</style>
<div id="board">
  
</div>
    `;

    this.boardEl_ = root.getElementById('board');
    this.resize_();
  }

  placeAt(x, y, curr) {
    const idx = this.idx_(x, y);
    if (idx < 0) {
      return null;
    }

    const prev = this.grid_[idx];

    if (curr) {
      const el = document.createElement('span');
      el.className = 'cell';
      el.style.transform = `translate(${x}em, ${y}em)`;
      el.style.background = curr;
      this.boardEl_.appendChild(el);

      this.grid_[idx] = {
        el: el,
        color: curr,
      };
    } else {
      this.grid_[idx] = null;
    }

    if (prev) {
      prev.el.remove();
      return prev.color;
    }
    return null;
  }

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
  }

  attributeChangedCallback(attrName, oldValue, newValue) {
    this.resize_();
  }

  get dim() {
    return +this.getAttribute('dim') || 8;
  }

}


customElements.define('gem-board', GemBoard);