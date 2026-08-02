// The "World" LiveView hook: a game-quality 3D god-view of the whole simulated
// world, rendered with the vendored global THREE + OrbitControls (no bundler).
// Height-mapped lit terrain with shadows, water, vegetation/props, a glowing
// agent avatar (beam + halo) with a fading trail, and atmosphere (fog, gradient
// sky, stars). Consumes the compact "scene" the server pushes each tick.
(function () {
  const GAP = 2.2; // empty tiles between region blocks
  const HS = 3.2; // height scale for elevation
  const AGENT_Y = 1.4; // hover above terrain top

  function color(str) {
    const c = new THREE.Color();
    c.setStyle(str || "rgb(60,60,70)");
    c.convertSRGBToLinear();
    return c;
  }

  function glowTexture() {
    const s = 128;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const ctx = cv.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,236,180,0.85)");
    g.addColorStop(1, "rgba(255,180,90,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return new THREE.CanvasTexture(cv);
  }

  function skyTexture() {
    const cv = document.createElement("canvas");
    cv.width = 4;
    cv.height = 256;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#0a1326");
    g.addColorStop(0.55, "#070a14");
    g.addColorStop(1, "#020306");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    return new THREE.CanvasTexture(cv);
  }

  window.World = {
    mounted() {
      const canvas = this.el;
      const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true }));
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.outputEncoding = THREE.sRGBEncoding;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.15;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = (this.scene = new THREE.Scene());
      scene.background = skyTexture();
      scene.fog = new THREE.Fog(0x070a14, 60, 240);

      this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
      this.camera.position.set(26, 34, 34);
      this.controls = new THREE.OrbitControls(this.camera, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.1;
      this.controls.maxPolarAngle = Math.PI * 0.49;

      // Lighting.
      scene.add(new THREE.HemisphereLight(0x9fb4e0, 0x1a2233, 0.75));
      const sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
      sun.position.set(34, 56, 22);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.near = 1;
      sc.far = 220;
      sc.left = -60;
      sc.right = 60;
      sc.top = 60;
      sc.bottom = -60;
      sun.shadow.bias = -0.0006;
      scene.add(sun);
      scene.add(sun.target);

      // Ocean / ground plane for context.
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(800, 800),
        new THREE.MeshStandardMaterial({ color: 0x0a1424, roughness: 1, metalness: 0 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.2;
      ground.receiveShadow = true;
      scene.add(ground);

      this._stars();
      this.glowTex = glowTexture();

      // Rebuilt-each-tick groups.
      this.terrain = new THREE.Group();
      this.water = new THREE.Group();
      this.props = new THREE.Group();
      this.markers = new THREE.Group();
      scene.add(this.terrain, this.water, this.props, this.markers);

      this._buildAgent();
      this._buildTrail();

      this.origins = {};
      this.lastTick = null;
      this.camMode = "follow";
      this.stack = false;
      this._snap = true;
      this._didInitialFit = false;

      this._wireControls();
      const ro = new ResizeObserver(() => this._resize());
      ro.observe(canvas);
      this._ro = ro;
      this._resize();

      this.handleEvent("scene", (s) => this.applyScene(s));
      this.pushEvent("world_ready", {});

      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        this._frame();
      };
      loop();
    },

    destroyed() {
      cancelAnimationFrame(this.raf);
      if (this._ro) this._ro.disconnect();
      if (this.renderer) this.renderer.dispose();
    },

    // --- persistent objects ----------------------------------------------------

    _stars() {
      const n = 1200;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const rad = 300 + Math.random() * 300;
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = rad * Math.sin(p) * Math.cos(t);
        pos[i * 3 + 1] = Math.abs(rad * Math.cos(p)) * 0.6 + 30;
        pos[i * 3 + 2] = rad * Math.sin(p) * Math.sin(t);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8a9bbb, size: 0.9, sizeAttenuation: true })));
    },

    _buildAgent() {
      const g = (this.agentGroup = new THREE.Group());
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 26, 26),
        new THREE.MeshStandardMaterial({ color: 0xffe9c0, emissive: 0xff9a3c, emissiveIntensity: 0.9, roughness: 0.4 })
      );
      orb.castShadow = true;
      this.agentOrb = orb;
      g.add(orb);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.05, 12, 40),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55 })
      );
      ring.rotation.x = Math.PI / 2;
      this.agentRing = ring;
      g.add(ring);

      // A small, thin marker beam — a locator, not a floodlight.
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.12, 5, 14, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      beam.position.y = 2.8;
      g.add(beam);

      this.agentLight = new THREE.PointLight(0xffd9a0, 0.9, 12, 2);
      g.add(this.agentLight);

      this.agentPos = new THREE.Vector3(0, AGENT_Y, 0);
      this.agentTarget = new THREE.Vector3(0, AGENT_Y, 0);
      this.scene.add(g);
    },

    _buildTrail() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(250 * 3), 3));
      this.trailPts = [];
      this.trailLine = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      this.trailLine.frustumCulled = false;
      this.scene.add(this.trailLine);
    },

    // --- scene application -----------------------------------------------------

    applyScene(s) {
      this.scene_data = s;
      if (this.lastTick != null && s.tick != null && s.tick < this.lastTick) {
        this.trailPts = [];
        this._snap = true;
      }
      this.lastTick = s.tick;

      [this.terrain, this.water, this.props, this.markers].forEach((g) => this._clear(g));
      this.origins = {};

      if (this.stack) return this._applyStack(s);

      const rw = s.rw || 6;
      const rh = s.rh || 6;
      const terr = [];
      const water = [];
      const trees = [];
      const rocks = [];
      const spikes = [];

      (s.regions || []).forEach((rg) => {
        const ox = rg.gx * (rw + GAP);
        const oz = rg.gy * (rh + GAP);
        this.origins[rg.id] = { ox, oz, w: rg.w, h: rg.h, elev: rg.elev };
        const n = rg.w * rg.h;
        for (let i = 0; i < n; i++) {
          const x = ox + (i % rg.w) + 0.5;
          const z = oz + Math.floor(i / rg.w) + 0.5;
          const h = Math.max(0.08, (rg.elev && rg.elev[i]) || 0.3) * HS;
          const kind = (rg.kinds && rg.kinds[i]) || "barren";
          terr.push({ x, z, h, c: color(rg.tiles[i]) });
          if (kind === "water") water.push({ x, z, top: h });
          else if (kind === "lush" && i % 2 === 0) trees.push({ x, z, top: h });
          else if (kind === "barren" && i % 3 === 0) rocks.push({ x, z, top: h });
          else if (kind === "toxic") spikes.push({ x, z, top: h });
        }
        if (rg.seam_ready) this._seamPillar(ox + rg.w / 2, oz + rg.h / 2);
        (rg.marks || []).forEach((m) => this._mark(rg, ox, oz, m));
      });

      this.terrain.add(this._terrainMesh(terr, 0, 1));
      if (water.length) this.water.add(this._waterMesh(water));
      this._propMesh(trees, new THREE.ConeGeometry(0.24, 0.8, 6), 0x3fae5a, 0x0d3a1c, 0.45);
      this._propMesh(rocks, new THREE.IcosahedronGeometry(0.22, 0), 0x6b7384, 0x000000, 0.2);
      this._propMesh(spikes, new THREE.ConeGeometry(0.16, 0.6, 5), 0xff5a5a, 0x5a1010, 0.35);
      this._edges(s);

      const a = s.agent;
      if (a && this.origins[a.region]) {
        this.agentGroup.visible = true;
        this.agentTarget.copy(this._cellTop(a.region, a.cell, AGENT_Y));
        if (this._snap) {
          this.agentPos.copy(this.agentTarget);
          this._snap = false;
        }
      } else {
        this.agentGroup.visible = false;
      }

      this._bbox(s, rw, rh);
      // Frame the whole world once on first load, then the follow camera tracks
      // the agent (or the user can switch to fit/orbit).
      if (!this._didInitialFit) {
        this._fit();
        this._didInitialFit = true;
      } else if (this.camMode === "fit") {
        this._fit();
      }
    },

    _applyStack(s) {
      this.agentGroup.visible = false;
      const rw = s.rw || 6;
      const rh = s.rh || 6;
      (s.regions || []).forEach((rg) => {
        const ox = rg.gx * (rw + GAP);
        const oz = rg.gy * (rh + GAP);
        this.origins[rg.id] = { ox, oz, w: rg.w, h: rg.h };
        (rg.stacks || []).forEach((layer, li) => {
          const list = [];
          for (let i = 0; i < rg.w * rg.h; i++) {
            list.push({ x: ox + (i % rg.w) + 0.5, z: oz + Math.floor(i / rg.w) + 0.5, h: 0.25, c: color(layer.colors[i]) });
          }
          this.terrain.add(this._terrainMesh(list, 1.2 + li * 2.6, 0.5));
        });
      });
      this._bbox(s, rw, rh);
      this._fit();
    },

    // --- mesh builders ---------------------------------------------------------

    _terrainMesh(list, yBase, opacity) {
      const geo = new THREE.BoxGeometry(0.98, 1, 0.98);
      const matOpts = { roughness: 0.92, metalness: 0.0, flatShading: true };
      if (opacity != null && opacity < 1) {
        matOpts.transparent = true;
        matOpts.opacity = opacity;
      }
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial(matOpts), list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const sca = new THREE.Vector3();
      const pos = new THREE.Vector3();
      list.forEach((t, i) => {
        sca.set(1, t.h, 1);
        pos.set(t.x, (yBase || 0) + t.h / 2, t.z);
        m.compose(pos, q, sca);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, t.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return mesh;
    },

    _waterMesh(list) {
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.0, 0.5, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x2f7ad0, emissive: 0x123a66, emissiveIntensity: 0.5, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.5 }),
        list.length
      );
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const sca = new THREE.Vector3(0.98, 1, 0.98);
      const pos = new THREE.Vector3();
      list.forEach((t, i) => {
        pos.set(t.x, t.top + 0.22, t.z);
        m.compose(pos, q, sca);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.waterMesh = mesh;
      return mesh;
    },

    _propMesh(list, geo, col, emissive, yoff) {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(
        geo,
        new THREE.MeshStandardMaterial({ color: col, emissive: emissive, emissiveIntensity: emissive ? 0.5 : 0, roughness: 0.7 }),
        list.length
      );
      mesh.castShadow = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const sca = new THREE.Vector3(1, 1, 1);
      const pos = new THREE.Vector3();
      const axis = new THREE.Vector3(0, 1, 0);
      list.forEach((t, i) => {
        q.setFromAxisAngle(axis, (i * 1.1) % 6.28);
        pos.set(t.x, t.top + yoff, t.z);
        m.compose(pos, q, sca);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.props.add(mesh);
    },

    _mark(rg, ox, oz, m) {
      const cell = m[0];
      const kind = m[1];
      const val = m[2];
      const x = ox + (cell % rg.w) + 0.5;
      const z = oz + Math.floor(cell / rg.w) + 0.5;
      const top = Math.max(0.08, (rg.elev && rg.elev[cell]) || 0.3) * HS;
      if (kind === "struct") {
        const tall = val === "R" ? 2.2 : 1.0;
        const c = val === "R" ? 0x7ce0d0 : 0x9aa6c0;
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.22, tall, 10),
          new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8, roughness: 0.4, metalness: 0.4 })
        );
        mesh.castShadow = true;
        mesh.position.set(x, top + tall / 2, z);
        this.markers.add(mesh);
        if (val === "R") this._halo(x, top + tall, z, 2.4);
      } else {
        const c = color(val);
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 14, 14),
          new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6 })
        );
        mesh.position.set(x, top + 0.35, z);
        this.markers.add(mesh);
      }
    },

    _seamPillar(x, z) {
      const c = 0xf9e2af;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 7, 12),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.3, transparent: true, opacity: 0.85 })
      );
      mesh.position.set(x, 3.5, z);
      this.markers.add(mesh);
      this._halo(x, 6.5, z, 4);
    },

    _halo(x, y, z, size) {
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })
      );
      sp.scale.set(size, size, 1);
      sp.position.set(x, y, z);
      this.markers.add(sp);
    },

    _edges(s) {
      const ctr = (id) => {
        const o = this.origins[id];
        return o ? new THREE.Vector3(o.ox + o.w / 2, 0.6, o.oz + o.h / 2) : null;
      };
      const draw = (edges, col, op) =>
        (edges || []).forEach((e) => {
          const pa = ctr(e[0]);
          const pb = ctr(e[1]);
          if (!pa || !pb) return;
          const geo = new THREE.BufferGeometry().setFromPoints([pa, pb]);
          this.markers.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op })));
        });
      draw(s.adjacency, 0x4a5578, 0.5);
      draw(s.seams, 0xf9e2af, 0.9);
    },

    // --- per-frame -------------------------------------------------------------

    _frame() {
      const now = performance.now() * 0.001;
      this.agentPos.lerp(this.agentTarget, 0.16);
      if (this.agentGroup) {
        this.agentGroup.position.set(this.agentPos.x, this.agentPos.y + Math.sin(now * 2) * 0.12, this.agentPos.z);
        if (this.agentRing) this.agentRing.rotation.z = now * 1.2;
      }
      if (this.waterMesh) this.waterMesh.position.y = Math.sin(now * 1.5) * 0.06;

      if (this.agentGroup && this.agentGroup.visible) {
        const p = this.agentGroup.position;
        const last = this.trailPts[this.trailPts.length - 1];
        if (!last || last.distanceTo(p) > 0.1) {
          this.trailPts.push(p.clone());
          if (this.trailPts.length > 250) this.trailPts.shift();
          this._updateTrail();
        }
      }

      if (this.camMode === "follow" && this.agentGroup && this.agentGroup.visible) {
        // Pan target AND camera by the same smoothed delta so we track the agent
        // while preserving the user's orbit angle and zoom.
        const delta = this.agentGroup.position.clone().sub(this.controls.target).multiplyScalar(0.1);
        this.controls.target.add(delta);
        this.camera.position.add(delta);
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    },

    _updateTrail() {
      const arr = this.trailLine.geometry.attributes.position.array;
      this.trailPts.forEach((p, i) => {
        arr[i * 3] = p.x;
        arr[i * 3 + 1] = p.y;
        arr[i * 3 + 2] = p.z;
      });
      this.trailLine.geometry.setDrawRange(0, this.trailPts.length);
      this.trailLine.geometry.attributes.position.needsUpdate = true;
    },

    // --- helpers ---------------------------------------------------------------

    _cellTop(regionId, cell, hover) {
      const o = this.origins[regionId];
      if (!o) return new THREE.Vector3(0, hover, 0);
      const top = Math.max(0.08, (o.elev && o.elev[cell]) || 0.3) * HS;
      return new THREE.Vector3(o.ox + (cell % o.w) + 0.5, top + hover, o.oz + Math.floor(cell / o.w) + 0.5);
    },

    _bbox(s, rw, rh) {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      (s.regions || []).forEach((r) => {
        const ox = r.gx * (rw + GAP);
        const oz = r.gy * (rh + GAP);
        a = Math.min(a, ox);
        b = Math.min(b, oz);
        c = Math.max(c, ox + r.w);
        d = Math.max(d, oz + r.h);
      });
      if (a === Infinity) return;
      this.box = { cx: (a + c) / 2, cz: (b + d) / 2, span: Math.max(c - a, d - b) };
    },

    _fit() {
      if (!this.box) return;
      const { cx, cz, span } = this.box;
      this.controls.target.set(cx, 1.5, cz);
      const dist = span * 1.25 + 14;
      this.camera.position.set(cx + dist * 0.38, dist * 0.78, cz + dist * 0.62);
    },

    _resize() {
      const w = this.el.clientWidth || 800;
      const h = this.el.clientHeight || 480;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    },

    _clear(group) {
      for (let i = group.children.length - 1; i >= 0; i--) {
        const c = group.children[i];
        group.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
    },

    _wireControls() {
      const wrap = this.el.closest(".world-wrap");
      if (!wrap) return;
      const buttons = wrap.querySelectorAll(".world-controls button[data-cam]");
      const setActive = (mode) =>
        buttons.forEach((bn) => bn.classList.toggle("active", bn.dataset.cam === mode && mode !== "stack"));
      buttons.forEach((bn) => {
        bn.addEventListener("click", () => {
          const cam = bn.dataset.cam;
          if (cam === "stack") {
            this.stack = !this.stack;
            bn.classList.toggle("active", this.stack);
            if (this.scene_data) this.applyScene(this.scene_data);
          } else {
            this.camMode = cam;
            setActive(cam);
            if (cam === "fit") this._fit();
          }
        });
      });
      setActive("follow");
    },
  };
})();
