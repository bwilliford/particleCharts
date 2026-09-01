/* Particle Charts — landing page behavior.
   Everything here is a consumer of the public API; nothing reaches inside. */

(function () {
  'use strict';

  var PC = window.ParticleCharts;
  if (!PC) {
    console.error('Particle Charts failed to load. Run `npm run build` first.');
    /* The reveal observer below never runs, and `.reveal` starts at opacity 0 —
       so without this the page would be blank rather than merely chartless. */
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      el.classList.add('in');
    });
    return;
  }

  /* Two palettes, one per theme. Neon teal is the house color and violet the
     one other hue; the light set keeps both hues and simply drops them below
     the lightness band that white ground would swallow.

     Dark: the pair clears CVD separation (worst deltaE 23.7) and contrast
     (>= 3:1) on near-black — teal sits above the usual lightness band, which is
     the point of a neon. Every slice hue keeps one channel well below 255 so
     additive stacking brightens it without collapsing it to white. Ordering
     validated for color-vision separation (worst adjacent deltaE 16.0,
     normal-vision 23.6).

     Bloom is additive, and additive light on a white page is invisible — it
     only washes the hue out. So the light theme trades glow for opacity. */
  var PALETTE = {
    dark: {
      teal: '#2ff0d6',
      violet: '#7c4dff',
      slices: ['#2ff0d6', '#7c4dff', '#ffb020', '#ff4d6d', '#9ae62f'],
      heroGrid: 'rgba(255,255,255,0.05)',
      bloom: 0.8,
      opacity: 0.7
    },
    light: {
      teal: '#0e9c88',
      violet: '#6b3df5',
      slices: ['#0e9c88', '#6b3df5', '#c2710c', '#d1274b', '#5b8c11'],
      heroGrid: 'rgba(22,26,34,0.07)',
      bloom: 0.16,
      opacity: 0.92
    }
  };

  /* The inline script in <head> has already settled this before first paint. */
  var theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  var C = PALETTE[theme];

  /* Chrome the charts share: the library's own theme plus the particle
     treatment that theme calls for. */
  function themed(extra) {
    var base = {
      theme: theme,
      particleBloom: C.bloom,
      particleOpacity: C.opacity
    };
    for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) base[key] = extra[key];
    return base;
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* A rising trend with one slow sine swell riding on it — the monotone curve
     has almost nothing to fight, so the band reads as a single sweep rather
     than a row of switchbacks. */
  var HERO_DATA = [22, 31, 37, 40, 39, 38, 40, 46, 56, 65, 71, 74];

  var TRAFFIC = {
    labels: ['Direct', 'Search', 'Social', 'Referral', 'Email'],
    values: [4820, 3140, 1760, 980, 540]
  };

  /* Spend against revenue, each point sized by headcount — the third value is
     what a bubble chart exists for, so the demo data has to carry one.

     Deliberately off the grid: the axis rounds itself out to 0, 20, 40 …, and
     nothing here lands on those. Data that happened to sit on every gridline
     would read as a category axis wearing numbers, which is the one thing a
     scatter is not. */
  function bubbleData(colors) {
    return {
      series: [
        {
          name: 'Enterprise',
          color: colors.teal,
          data: [
            { x: 6, y: 31, r: 14 }, { x: 14, y: 44, r: 38 }, { x: 23, y: 37, r: 22 },
            { x: 29, y: 58, r: 61 }, { x: 41, y: 49, r: 30 }, { x: 47, y: 72, r: 45 },
            { x: 58, y: 63, r: 26 }, { x: 66, y: 81, r: 54 }, { x: 79, y: 68, r: 33 },
            { x: 91, y: 87, r: 19 }
          ]
        },
        {
          name: 'Self-serve',
          color: colors.violet,
          data: [
            { x: 9, y: 12, r: 8 }, { x: 17, y: 24, r: 17 }, { x: 26, y: 18, r: 11 },
            { x: 34, y: 33, r: 29 }, { x: 43, y: 27, r: 13 }, { x: 52, y: 41, r: 34 },
            { x: 61, y: 29, r: 9 }, { x: 73, y: 46, r: 24 }, { x: 84, y: 38, r: 16 },
            { x: 94, y: 53, r: 41 }
          ]
        }
      ]
    };
  }

  /* Short spoke labels on purpose: a radar in a 240px card has to fit its own
     axis, and every extra character comes straight off the web's radius. */
  function radarData(colors) {
    return {
      labels: ['Speed', 'Power', 'Range', 'Cost', 'Comfort', 'Safety'],
      series: [
        { name: 'Model A', color: colors.teal, data: [86, 62, 74, 45, 68, 90] },
        { name: 'Model B', color: colors.violet, data: [58, 88, 52, 78, 84, 66] }
      ]
    };
  }

  // ------------------------------------------------------------- charts ----

  /* Every chart on this page is collected here so you can poke at them from
     the devtools console: demoCharts[0].setOptions({ particleBloom: 0.9 }) */
  var demoCharts = (window.demoCharts = []);
  function track(chart) { demoCharts.push(chart); return chart; }

  /* Series colors live inside the data, so a theme change rebuilds these five
     rather than restyling them — five constructors are cheaper than the
     plumbing, and the particles flying back into place sells the switch. */
  var demos = [];

  function buildDemos() {
    demos.forEach(function (chart) {
      demoCharts.splice(demoCharts.indexOf(chart), 1);
      chart.destroy();
    });
    demos = [];

    function demo(chart) { demos.push(chart); return track(chart); }

    var hero = demo(new PC.ParticleChart('#hero-chart', themed({
      type: 'bar',
      data: { labels: MONTHS, name: 'Revenue', values: HERO_DATA },
      particleColor: C.teal,
      showLegend: false,
      valueFormat: function (v) { return '$' + v + 'k'; },
      axis: { ticks: 4, gridColor: C.heroGrid }
    })));

    document.getElementById('hero-caption').textContent =
      'a slow swell of growth, twelve months of it \u00b7 ' +
      hero.field.count.toLocaleString() + ' particles';

    demo(new PC.ParticleChart('#demo-bar', themed({
      type: 'bar',
      data: {
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [
          { name: 'This year', data: [42, 58, 51, 73], color: C.teal },
          { name: 'Last year', data: [35, 44, 47, 58], color: C.violet }
        ]
      },
      showValues: true,
      axis: { ticks: 4 }
    })));

    demo(new PC.ParticleChart('#demo-line', themed({
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        series: [
          { name: 'This week', data: [32, 41, 38, 55, 49, 62, 58], color: C.teal },
          { name: 'Last week', data: [28, 30, 35, 36, 44, 41, 47], color: C.violet }
        ]
      },
      axis: { ticks: 4 }
    })));

    demo(new PC.ParticleChart('#demo-pie', themed({
      type: 'pie',
      data: TRAFFIC,
      particleColor: C.slices,
      showValues: true,
      padAngle: 3,
      legendPosition: 'right'
    })));

    demo(new PC.ParticleChart('#demo-donut', themed({
      type: 'donut',
      data: TRAFFIC,
      particleColor: C.slices,
      showValues: true,
      padAngle: 3,
      legendPosition: 'right'
    })));

    demo(new PC.ParticleChart('#demo-bubble', themed({
      type: 'bubble',
      data: bubbleData(C),
      minRadius: 4,
      maxRadius: 22,
      axis: { ticks: 4 }
    })));

    demo(new PC.ParticleChart('#demo-radar', themed({
      type: 'radar',
      data: radarData(C),
      max: 100,
      levels: 4
    })));
  }

  buildDemos();

  // --------------------------------------------------------- playground ----

  /* Rebuilt per call rather than held as a constant: the series colors come
     from the active palette, which the theme toggle can change underneath us. */
  function playData(type) {
    if (type === 'pie' || type === 'donut') return TRAFFIC;
    if (type === 'bubble') return bubbleData(C);
    if (type === 'radar') return radarData(C);
    return {
      labels: MONTHS.slice(0, 8),
      series: [
        { name: 'Sessions', data: [24, 31, 28, 42, 39, 51, 48, 60], color: C.teal },
        { name: 'Signups', data: [11, 14, 13, 19, 22, 24, 26, 31], color: C.violet }
      ]
    };
  }

  var state = {
    type: 'bar',
    density: 15,
    size: 0.8,
    bloom: 0.8,
    jitter: 1,
    axis: true,
    grid: true,
    legend: true,
    values: false
  };

  var play = null;

  /* Pie and donut key color to the *category*, so they take the slice palette
     and a side legend. Every other type keys color to the series, which the
     data already carries. */
  function isRadial(type) {
    return type === 'pie' || type === 'donut';
  }

  function playOptions() {
    var radial = isRadial(state.type);
    return {
      type: state.type,
      theme: theme,
      data: playData(state.type),
      particleColor: radial ? C.slices : undefined,
      particleOpacity: C.opacity,
      particleDensity: state.density,
      particleSize: state.size,
      particleBloom: state.bloom,
      particleJitter: state.jitter,
      showAxis: state.axis,
      showGrid: state.grid,
      showLegend: state.legend,
      showValues: state.values,
      // Radial charts key color to the category, so their legend reads as a
      // label list beside the ring. Everything else takes the type default,
      // which is under the plot and centered.
      legendPosition: radial ? 'right' : undefined,
      padAngle: 3,
      // Radar reads as a share of a fixed ceiling, not of whatever it happens
      // to reach, so the web is pinned rather than fitted to the data.
      max: state.type === 'radar' ? 100 : undefined,
      minRadius: 4,
      maxRadius: 26
    };
  }

  function buildPlay() {
    if (play) {
      demoCharts.splice(demoCharts.indexOf(play), 1);
      play.destroy();
    }
    play = track(new PC.ParticleChart('#play-chart', playOptions()));
    renderPlayCode();
  }

  /* Type changes rebuild the chart; everything else is a live option swap so
     the particles keep their positions and simply re-tune. */
  function tunePlay() {
    if (!play) return buildPlay();
    play.setOptions(playOptions());
    renderPlayCode();
  }

  function renderPlayCode() {
    var radial = isRadial(state.type);
    var lines = [
      'const chart = new ParticleChart(\'#chart\', {',
      '  type: \'' + state.type + '\',',
      '  data,',
      radial
        ? '  particleColor: [\'' + C.slices.slice(0, 3).join('\', \'') + '\', ...],'
        : '  particleColor: \'' + C.teal + '\',',
      '  particleDensity: ' + state.density.toFixed(1) + ',',
      '  particleSize: ' + state.size.toFixed(1) + ',',
      '  particleBloom: ' + state.bloom.toFixed(2) + ',',
      '  particleJitter: ' + state.jitter.toFixed(1) + ',',
      '  showAxis: ' + state.axis + ',',
      '  showGrid: ' + state.grid + ',',
      '  showLegend: ' + state.legend + ',',
      '  showValues: ' + state.values
    ];
    /* Dark is the library default, so only the light case is worth printing. */
    if (theme === 'light') {
      lines[lines.length - 1] += ',';
      lines.push('  theme: \'light\'');
    }
    lines.push('});');
    document.getElementById('play-code').innerHTML = highlight(lines.join('\n'));
  }

  var seg = document.getElementById('type-seg');
  seg.addEventListener('click', function (event) {
    var btn = event.target.closest('button[data-type]');
    if (!btn) return;
    state.type = btn.dataset.type;
    Array.prototype.forEach.call(seg.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-pressed', String(b === btn));
    });
    buildPlay();
  });

  [
    ['c-density', 'v-density', 'density', 1],
    ['c-size', 'v-size', 'size', 1],
    ['c-bloom', 'v-bloom', 'bloom', 2],
    ['c-jitter', 'v-jitter', 'jitter', 1]
  ].forEach(function (row) {
    var input = document.getElementById(row[0]);
    var out = document.getElementById(row[1]);
    out.textContent = Number(input.value).toFixed(row[3]);
    input.addEventListener('input', function () {
      state[row[2]] = Number(input.value);
      out.textContent = state[row[2]].toFixed(row[3]);
      tunePlay();
    });
  });

  [['c-axis', 'axis'], ['c-grid', 'grid'], ['c-legend', 'legend'], ['c-values', 'values']].forEach(function (row) {
    var input = document.getElementById(row[0]);
    input.addEventListener('change', function () {
      state[row[1]] = input.checked;
      tunePlay();
    });
  });

  buildPlay();

  // ------------------------------------------------------ code samples ----

  var CDN = 'https://cdn.jsdelivr.net/npm/particle-charts@1/dist/particle-charts.min.js';

  var SAMPLES = {
    cdn: [
      '<script src="' + CDN + '"><\/script>'
    ].join('\n'),

    npm: [
      'npm install particle-charts'
    ].join('\n'),

    html: [
      '<script src="' + CDN + '"><\/script>',
      '',
      '<div id="chart" style="height: 320px"><\/div>',
      '',
      '<script>',
      '  new ParticleCharts.ParticleChart(\'#chart\', {',
      '    type: \'line\',',
      '    data: [12, 19, 15, 27, 24, 33]',
      '  });',
      '<\/script>'
    ].join('\n'),

    options: [
      'new ParticleCharts.ParticleChart(\'#chart\', {',
      '  type: \'bar\',',
      '  data: {',
      '    labels: [\'Q1\', \'Q2\', \'Q3\', \'Q4\'],',
      '    series: [',
      '      { name: \'Revenue\', data: [42, 58, 51, 73] },',
      '      { name: \'Costs\',   data: [30, 33, 36, 41] }',
      '    ]',
      '  },',
      '  particleColor: \'#2ff0d6\',',
      '  particleDensity: 1.4,',
      '  particleBloom: 0.6,',
      '  stacked: false,',
      '  showValues: true',
      '});'
    ].join('\n'),

    esm: [
      'import { ParticleChart, donut } from \'particle-charts\';',
      '',
      'const chart = new ParticleChart(el, {',
      '  type: \'donut\',',
      '  data: { Direct: 4820, Search: 3140, Social: 1760 },',
      '  innerRadius: 0.62',
      '});',
      '',
      '// or the shorthand',
      'donut(el, { Direct: 4820, Search: 3140 });'
    ].join('\n'),

    update: [
      '// Particles morph to the new shape — nothing is torn down.',
      'chart.update(nextData);',
      '',
      '// Restyle without touching the data.',
      'chart.setOptions({ particleBloom: 1, particleSize: 1.2 });',
      '',
      '// Snapshot, then clean up.',
      'const png = chart.toDataURL();',
      'chart.destroy();'
    ].join('\n')
  };

  Array.prototype.forEach.call(document.querySelectorAll('pre.code[data-code]'), function (pre) {
    pre.innerHTML = highlight(SAMPLES[pre.dataset.code] || '');
  });

  /* Minimal single-pass highlighter: escape first, then tokenise once so no
     replacement can land inside another's markup. */
  function highlight(code) {
    var escaped = String(code)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    /* The `//` of a comment must be at a line start or follow whitespace —
       otherwise the `//` in a CDN URL swallows the rest of the line. The lead
       character is captured so it can be put back outside the span. */
    var RE = new RegExp(
      [
        '(^|\\s)(\\/\\/[^\\n]*)',
        "('(?:[^'\\\\\\n]|\\\\.)*')",
        '(&lt;\\/?[a-zA-Z][\\w-]*)',
        '\\b(const|let|var|new|import|from|function|return|export|default|async|await|true|false|null)\\b',
        '\\b(\\d+(?:\\.\\d+)?)\\b'
      ].join('|'),
      'gm'
    );

    return escaped.replace(RE, function (match, lead, comment, string, tag, keyword, number) {
      if (comment) return lead + '<span class="c">' + comment + '</span>';
      if (string) return '<span class="s">' + string + '</span>';
      if (tag) return '<span class="k">' + tag + '</span>';
      if (keyword) return '<span class="k">' + keyword + '</span>';
      if (number) return '<span class="n">' + number + '</span>';
      return match;
    });
  }

  // ------------------------------------------------------------ scroll ----

  /* Six live canvases all animating through a scroll is what makes a page feel
     sticky. Freeze them while the wheel is moving and resume just after it
     stops — the particles hold their last frame for a moment, which nobody
     notices, and the main thread is left to the scroll. */
  var scrollTimer = null;
  window.addEventListener('scroll', function () {
    if (scrollTimer === null) demoCharts.forEach(function (c) { c.stop(); });
    else clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      demoCharts.forEach(function (c) { c.start(); });
    }, 140);
  }, { passive: true });

  // ------------------------------------------------------------ chrome ----

  var pill = document.getElementById('version-pill');
  if (pill && PC.version) pill.textContent = 'v' + PC.version;

  var themeBtn = document.getElementById('theme-toggle');

  function labelTheme() {
    themeBtn.setAttribute('aria-label',
      theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
  }

  labelTheme();
  themeBtn.addEventListener('click', function () {
    theme = theme === 'light' ? 'dark' : 'light';
    C = PALETTE[theme];
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pc-theme', theme); } catch (e) { /* private mode */ }
    labelTheme();
    buildDemos();
    buildPlay();
  });

  /* Follow the OS only for as long as the reader has not made a choice here. */
  if (window.matchMedia) {
    var os = window.matchMedia('(prefers-color-scheme: light)');
    var onOsChange = function (event) {
      var chosen = null;
      try { chosen = localStorage.getItem('pc-theme'); } catch (e) { /* private mode */ }
      if (chosen === 'light' || chosen === 'dark') return;
      theme = event.matches ? 'light' : 'dark';
      C = PALETTE[theme];
      document.documentElement.dataset.theme = theme;
      labelTheme();
      buildDemos();
      buildPlay();
    };
    if (os.addEventListener) os.addEventListener('change', onOsChange);
    else if (os.addListener) os.addListener(onOsChange);
  }

  if ('IntersectionObserver' in window) {
    var reveal = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        reveal.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      reveal.observe(el);
    });
  } else {
    Array.prototype.forEach.call(document.querySelectorAll('.reveal'), function (el) {
      el.classList.add('in');
    });
  }
})();
