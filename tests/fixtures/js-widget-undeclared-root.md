

```js-widget
(() => {
  const host = container;

   root.style.cssText = `
    max-width:850px;padding:18px;margin:12px auto;
    border:1px solid #cbd5e1;border-radius:12px;
    background:#fff;color:#1e293b;
    font-family:system-ui,sans-serif;
    box-sizing:border-box;
  `;

  root.innerHTML = `
    <div style="font-weight:650;font-size:17px;margin-bottom:12px">
      库仑势、离心势垒与有效势能
    </div>
    <div style="display:flex;align-items:center;gap:15px;margin-bottom:10px">
      <label for="l-slider" style="white-space:nowrap">
        角量子数 l = <strong class="l-value">1</strong>
      </label>
      <input class="l-slider" type="range" min="0" max="8"
             step="1" value="1" style="flex:1">
    </div>
    <canvas style="width:100%;height:390px;display:block"></canvas>
    <div style="display:flex;flex-wrap:wrap;gap:14px;
                font-size:12px;margin:12px 0">
      <span style="color:#2563eb">━━ 有效势能</span>
      <span style="color:#dc2626">┄┄ 库仑势</span>
      <span style="color:#16a34a">┄┄ 离心势垒</span>
    </div>
    <div class="info" style="font-size:13px;line-height:1.9;
                            border-top:1px solid #e2e8f0;
                            padding-top:9px"></div>
  `;

  host.appendChild(root);

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const slider = root.querySelector(".l-slider");
  const valueLabel = root.querySelector(".l-value");
  const info = root.querySelector(".info");

  const Z = 1;

  function draw() {
    const l = Number(slider.value);
    const L = l * (l + 1);
    valueLabel.textContent = l;

    const width = Math.max(canvas.getBoundingClientRect().width, 300);
    const height = 390;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const margin = { left: 65, right: 22, top: 25, bottom: 50 };
    const W = width - margin.left - margin.right;
    const H = height - margin.top - margin.bottom;

    // 自适应范围：高 l 的势阱在更大的半径处
    const rMin = 0.12;
    const rMax = l === 0 ? 12 : Math.max(12, 1.8 * L / Z);

    const minEnergy = l === 0 ? -3 : -Z * Z / (2 * L);
    const yMin = l === 0 ? -3.5 : 1.7 * minEnergy;
    const yMax = l === 0 ? 0.8 : -6 * minEnergy;

    const X = r => margin.left + (r - rMin) / (rMax - rMin) * W;
    const Y = v => margin.top + (yMax - v) / (yMax - yMin) * H;

    const coulomb = r => -Z / r;
    const centrifugal = r => L / (2 * r * r);
    const effective = r => coulomb(r) + centrifugal(r);

    ctx.clearRect(0, 0, width, height);

    // 网格和刻度
    ctx.font = "12px system-ui";
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#e2e8f0";
    ctx.fillStyle = "#64748b";

    for (let i = 0; i <= 6; i++) {
      const r = rMin + (rMax - rMin) * i / 6;
      const x = X(r);
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, margin.top + H);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(r.toFixed(rMax > 30 ? 0 : 1), x, margin.top + H + 19);
    }

    for (let i = 0; i <= 6; i++) {
      const v = yMin + (yMax - yMin) * i / 6;
      const y = Y(v);
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + W, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(Number(v.toPrecision(2)).toString(), margin.left - 8, y + 4);
    }

    // 零能量参考线
    if (yMin < 0 && yMax > 0) {
      ctx.beginPath();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 1.4;
      ctx.moveTo(margin.left, Y(0));
      ctx.lineTo(margin.left + W, Y(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 限制曲线在绘图区内部
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, W, H);
    ctx.clip();

    function curve(fn, color, dashed = false, lineWidth = 2.2) {
      ctx.beginPath();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = color;
      ctx.setLineDash(dashed ? [7, 5] : []);

      const samples = 1500;
      for (let i = 0; i <= samples; i++) {
        const r = rMin + (rMax - rMin) * i / samples;
        const y = Y(fn(r));
        if (i === 0) ctx.moveTo(X(r), y);
        else ctx.lineTo(X(r), y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    curve(coulomb, "#dc2626", true, 1.8);
    if (l > 0) curve(centrifugal, "#16a34a", true, 1.8);
    curve(effective, "#2563eb", false, 2.8);

    // 有限半径的有效势能极小值
    if (l > 0) {
      const r0 = L / Z;
      const v0 = -Z * Z / (2 * L);
      ctx.beginPath();
      ctx.fillStyle = "#2563eb";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.arc(X(r0), Y(v0), 5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    // 坐标轴标题
    ctx.fillStyle = "#334155";
    ctx.font = "13px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("无量纲半径 ρ = r/a", margin.left + W / 2, height - 8);

    ctx.save();
    ctx.translate(17, margin.top + H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("势能 V / Eₕ", 0, 0);
    ctx.restore();

    // 物理说明
    if (l === 0) {
      info.innerHTML = `
        <b>l = 0（s 态）</b><br>
        离心项为零，Veff = −Z/ρ。<br>
        r → 0 时 Veff → −∞，不存在有限半径的势能极小点。
      `;
    } else {
      const r0 = L / Z;
      const v0 = -Z * Z / (2 * L);
      info.innerHTML = `
        <b>l = ${l}，l(l+1) = ${L}</b><br>
        势能极小点：ρₘᵢₙ = ${r0.toFixed(2)}<br>
        最低有效势能：Vₘᵢₙ/Eₕ = ${v0.toFixed(5)}<br>
        r → 0 时离心项占优，Veff → +∞。<br>
        注：坐标轴随 l 自动缩放，便于观察势阱形状。
      `;
    }
  }

  slider.addEventListener("input", draw);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(draw).observe(root);
  } else {
    window.addEventListener("resize", draw);
  }
  draw();

})();
```
