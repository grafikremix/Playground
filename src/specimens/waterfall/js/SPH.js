/**
 * Vendored from SPHjs by asadm
 * https://github.com/asadm/SPHjs
 * License: MIT (stated in the upstream README; no separate LICENSE file).
 *
 * Playground extensions are marked "Playground extension".
 */

const TAU = Math.PI * 2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * A compact, fixed-step SPH-style solver.
 *
 * Particle state is stored in typed, structure-of-arrays buffers. Neighbor
 * queries use a linked-list spatial hash whose cell size matches the smoothing
 * radius. Every pair is visited once across the surrounding 3x3 cells.
 */
export default class SPH {
  constructor({
    width = 1,
    height = 1,
    maxParticles = 6000,
    smoothingRadius = 32,
    boundaryPadding = 18,
  } = {}) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.maxParticles = Math.max(128, maxParticles | 0);
    this.count = 0;

    this.smoothingRadius = smoothingRadius;
    this.smoothingRadiusSquared = smoothingRadius * smoothingRadius;
    this.inverseSmoothingRadius = 1 / smoothingRadius;

    // Double-density relaxation parameters. Negative pressure is deliberately
    // capped: it supplies cohesion without allowing isolated pairs to implode.
    this.restDensity = 5.2;
    this.stiffness = 850;
    this.nearStiffness = 1100;
    this.minimumPressure = -1.3;

    this.gravityStrength = 920;
    this.motionGravityStrength = 1800;
    this.gravityResponse = 18;
    this.gravityX = 0;
    this.gravityY = this.gravityStrength;
    this.targetGravityX = 0;
    this.targetGravityY = this.gravityStrength;
    this.velocityLimit = 800;
    this.boundaryPadding = Math.max(1, boundaryPadding);

    this.x = new Float32Array(this.maxParticles);
    this.y = new Float32Array(this.maxParticles);
    this.previousX = new Float32Array(this.maxParticles);
    this.previousY = new Float32Array(this.maxParticles);
    this.vx = new Float32Array(this.maxParticles);
    this.vy = new Float32Array(this.maxParticles);
    this.density = new Float32Array(this.maxParticles);
    this.nearDensity = new Float32Array(this.maxParticles);
    this.pressure = new Float32Array(this.maxParticles);
    this.nearPressure = new Float32Array(this.maxParticles);
    this.correctionX = new Float32Array(this.maxParticles);
    this.correctionY = new Float32Array(this.maxParticles);
    this.nextParticle = new Int32Array(this.maxParticles);
    this.collisionFlags = new Uint8Array(this.maxParticles);

    // Playground extension: stroke capsules, rising pool floor, CCD metrics.
    this.backend = "CPU SPH";
    this.capsules = [];
    this.capsuleRadius = 16;
    this.particleRadius = 12;
    this.floorY = Number.POSITIVE_INFINITY;
    this.crossings = 0;
    this.hitEnergy = 0;
    this.lastSign = new Int8Array(this.maxParticles * 160);

    this.repulsor = {
      active: false,
      x: 0,
      y: 0,
      radius: 88,
      strength: 6500,
      pulse: 0,
    };

    this.emissionIndex = 0;
    this._allocateGrid();
  }

  get numParticles() {
    return this.count;
  }

  get CanvasWidth() {
    return this.width;
  }

  get CanvasHeight() {
    return this.height;
  }

  _allocateGrid() {
    this.gridColumns = Math.max(1, Math.ceil(this.width / this.smoothingRadius));
    this.gridRows = Math.max(1, Math.ceil(this.height / this.smoothingRadius));
    this.gridHeads = new Int32Array(this.gridColumns * this.gridRows);
    this.gridHeads.fill(-1);
  }

  resize(width, height) {
    const nextWidth = Math.max(1, width);
    const nextHeight = Math.max(1, height);
    if (nextWidth === this.width && nextHeight === this.height) {
      return;
    }

    // Playground: tall scrollable world is not an orientation change — skip rescale.

    this.width = nextWidth;
    this.height = nextHeight;
    this._allocateGrid();
    this._constrainPositions();
  }

  clear() {
    this.count = 0;
    this.emissionIndex = 0;
    this.repulsor.active = false;
    this.repulsor.pulse = 0;
    this.crossings = 0;
    this.hitEnergy = 0;
    this.lastSign.fill(0);
  }

  setGravityDirection(x, y) {
    const magnitude = Math.hypot(x, y);
    if (!Number.isFinite(magnitude)) {
      return;
    }

    const scale = magnitude > 1 ? 1 / magnitude : 1;
    this.targetGravityX = x * scale * this.motionGravityStrength;
    this.targetGravityY = y * scale * this.motionGravityStrength;
  }

  resetGravity() {
    this.targetGravityX = 0;
    this.targetGravityY = this.gravityStrength;
  }

  setBoundaryPadding(padding) {
    if (!Number.isFinite(padding)) {
      return;
    }
    this.boundaryPadding = clamp(
      padding,
      1,
      Math.max(1, Math.min(this.width, this.height) * 0.5),
    );
    this._constrainPositions();
  }

  setRepulsor(x, y, active = true) {
    this.repulsor.x = x;
    this.repulsor.y = y;
    this.repulsor.active = active;
  }

  push(x, y, radius = 88, strength = 900) {
    this.repulsor.x = x;
    this.repulsor.y = y;
    this.repulsor.radius = radius;
    this.repulsor.pulse = 0.7;
    const radiusSquared = radius * radius;

    for (let i = 0; i < this.count; i += 1) {
      let dx = this.x[i] - x;
      let dy = this.y[i] - y;
      let distanceSquared = dx * dx + dy * dy;

      if (distanceSquared >= radiusSquared) {
        continue;
      }
      if (distanceSquared < 0.001) {
        const angle = ((i * 0.754877666) % 1) * TAU;
        dx = Math.cos(angle) * 0.01;
        dy = Math.sin(angle) * 0.01;
        distanceSquared = 0.0001;
      }

      const distance = Math.sqrt(distanceSquared);
      const falloff = 1 - distance / radius;
      const normalX = dx / distance;
      const normalY = dy / distance;
      const impulse = strength * falloff * falloff;
      const clearedRadius = radius * 0.7;
      const displacement = Math.max(
        8 * falloff * falloff,
        (clearedRadius - distance) * 0.82,
      );
      this.vx[i] += normalX * impulse;
      this.vy[i] += normalY * impulse;
      this.x[i] += normalX * displacement;
      this.y[i] += normalY * displacement;
    }

    this._constrainPositions();
  }

  addParticle(x, y, vx = 0, vy = 0) {
    if (this.count >= this.maxParticles) {
      return false;
    }

    const i = this.count;
    const padding = this.boundaryPadding;
    this.x[i] = clamp(x, padding, Math.max(padding, this.width - padding));
    this.y[i] = clamp(y, padding, Math.max(padding, this.height - padding));
    this.previousX[i] = this.x[i];
    this.previousY[i] = this.y[i];
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.count += 1;
    return true;
  }

  emit(x, y, amount = 1, vx = 0, vy = 70) {
    let emitted = 0;
    const batch = this.emissionIndex++;
    const hasCenter = (amount & 1) === 1;
    const ringCount = amount - (hasCenter ? 1 : 0);
    const phase = batch * 2.3999632297;
    const radius = 11 + (batch % 3) * 2;

    for (let n = 0; n < amount && this.count < this.maxParticles; n += 1) {
      let offsetX = 0;
      let offsetY = 0;

      if (!hasCenter || n > 0) {
        const ringIndex = hasCenter ? n - 1 : n;
        const angle = phase + ringIndex * TAU / ringCount;
        offsetX = Math.cos(angle) * radius;
        offsetY = Math.sin(angle) * radius;
      }

      if (this.addParticle(
        x + offsetX,
        y + offsetY,
        vx + offsetX * 0.25,
        vy,
      )) {
        emitted += 1;
      }
    }

    return emitted;
  }

  seedPool(requestedCount = 420) {
    this.clear();

    const spacing = 10.5;
    const poolWidth = Math.min(this.width * 0.68, 520);
    const columns = Math.max(2, Math.floor(poolWidth / spacing));
    const rows = Math.max(1, Math.floor(Math.min(this.height * 0.52, 520) / spacing));
    const count = Math.min(requestedCount, columns * rows, this.maxParticles);
    const actualWidth = (columns - 1) * spacing;
    const startX = (this.width - actualWidth) * 0.5;
    const bottom = this.height - Math.max(18, this.height * 0.035);

    for (let i = 0; i < count; i += 1) {
      const row = Math.floor(i / columns);
      const column = i % columns;
      const offset = (row & 1) * spacing * 0.5;
      this.addParticle(
        startX + column * spacing + offset,
        bottom - row * spacing,
      );
    }

    return this.count;
  }

  step(dt) {
    if (this.count === 0) {
      return;
    }

    const safeDt = clamp(dt, 1 / 240, 1 / 30);
    this._integratePrediction(safeDt);
    this._buildGrid();
    this._computeDensities();
    this._relaxPositions(safeDt);
    this._constrainPositions();
    this._collideCapsules(safeDt);
    this._updateVelocities(safeDt);
  }

  _integratePrediction(dt) {
    const gravityBlend = 1 - Math.exp(-dt * this.gravityResponse);
    this.gravityX += (this.targetGravityX - this.gravityX) * gravityBlend;
    this.gravityY += (this.targetGravityY - this.gravityY) * gravityBlend;

    const damping = Math.pow(0.98, dt * 60);
    const repulsor = this.repulsor;
    const radiusSquared = repulsor.radius * repulsor.radius;
    const isRepulsing = repulsor.active || repulsor.pulse > 0;
    repulsor.pulse = Math.max(0, repulsor.pulse - dt);

    for (let i = 0; i < this.count; i += 1) {
      let velocityX = (this.vx[i] + this.gravityX * dt) * damping;
      let velocityY = (this.vy[i] + this.gravityY * dt) * damping;

      if (isRepulsing) {
        const dx = this.x[i] - repulsor.x;
        const dy = this.y[i] - repulsor.y;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared < radiusSquared) {
          const distance = Math.sqrt(Math.max(distanceSquared, 0.01));
          const falloff = 1 - distance / repulsor.radius;
          const impulse = repulsor.strength * falloff * falloff * dt;
          velocityX += (dx / distance) * impulse;
          velocityY += (dy / distance) * impulse;
        }
      }

      this.previousX[i] = this.x[i];
      this.previousY[i] = this.y[i];
      this.vx[i] = velocityX;
      this.vy[i] = velocityY;
      this.x[i] += velocityX * dt;
      this.y[i] += velocityY * dt;
    }
  }

  _buildGrid() {
    this.gridHeads.fill(-1);
    const inverseCellSize = this.inverseSmoothingRadius;
    const maxColumn = this.gridColumns - 1;
    const maxRow = this.gridRows - 1;

    for (let i = 0; i < this.count; i += 1) {
      const column = clamp(Math.floor(this.x[i] * inverseCellSize), 0, maxColumn);
      const row = clamp(Math.floor(this.y[i] * inverseCellSize), 0, maxRow);
      const cell = row * this.gridColumns + column;
      this.nextParticle[i] = this.gridHeads[cell];
      this.gridHeads[cell] = i;
    }
  }

  _computeDensities() {
    const count = this.count;
    const columns = this.gridColumns;
    const rows = this.gridRows;
    const inverseRadius = this.inverseSmoothingRadius;
    const radiusSquared = this.smoothingRadiusSquared;

    this.density.fill(1, 0, count);
    this.nearDensity.fill(1, 0, count);

    for (let i = 0; i < count; i += 1) {
      const centerColumn = clamp(Math.floor(this.x[i] * inverseRadius), 0, columns - 1);
      const centerRow = clamp(Math.floor(this.y[i] * inverseRadius), 0, rows - 1);
      const minColumn = Math.max(0, centerColumn - 1);
      const maxColumn = Math.min(columns - 1, centerColumn + 1);
      const minRow = Math.max(0, centerRow - 1);
      const maxRow = Math.min(rows - 1, centerRow + 1);

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          let j = this.gridHeads[row * columns + column];

          while (j !== -1) {
            if (j > i) {
              const dx = this.x[i] - this.x[j];
              const dy = this.y[i] - this.y[j];
              const distanceSquared = dx * dx + dy * dy;

              if (distanceSquared < radiusSquared) {
                const distance = Math.sqrt(distanceSquared);
                const weight = 1 - distance * inverseRadius;
                const densityWeight = weight * weight;
                const nearWeight = densityWeight * weight;
                this.density[i] += densityWeight;
                this.density[j] += densityWeight;
                this.nearDensity[i] += nearWeight;
                this.nearDensity[j] += nearWeight;
              }
            }
            j = this.nextParticle[j];
          }
        }
      }
    }

    for (let i = 0; i < count; i += 1) {
      const densityError = Math.max(
        this.minimumPressure,
        this.density[i] - this.restDensity,
      );
      this.pressure[i] = densityError * this.stiffness;
      this.nearPressure[i] = this.nearDensity[i] * this.nearStiffness;
    }
  }

  _relaxPositions(dt) {
    const count = this.count;
    const columns = this.gridColumns;
    const rows = this.gridRows;
    const inverseRadius = this.inverseSmoothingRadius;
    const radiusSquared = this.smoothingRadiusSquared;
    const dtSquared = dt * dt;
    const maximumPairDisplacement = this.smoothingRadius * 0.06;
    const maximumTotalDisplacement = this.smoothingRadius * 0.12;
    const correctionX = this.correctionX;
    const correctionY = this.correctionY;

    correctionX.fill(0, 0, count);
    correctionY.fill(0, 0, count);

    for (let i = 0; i < count; i += 1) {
      const centerColumn = clamp(Math.floor(this.x[i] * inverseRadius), 0, columns - 1);
      const centerRow = clamp(Math.floor(this.y[i] * inverseRadius), 0, rows - 1);
      const minColumn = Math.max(0, centerColumn - 1);
      const maxColumn = Math.min(columns - 1, centerColumn + 1);
      const minRow = Math.max(0, centerRow - 1);
      const maxRow = Math.min(rows - 1, centerRow + 1);

      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          let j = this.gridHeads[row * columns + column];

          while (j !== -1) {
            if (j > i) {
              let dx = this.x[i] - this.x[j];
              let dy = this.y[i] - this.y[j];
              let distanceSquared = dx * dx + dy * dy;

              if (distanceSquared < radiusSquared) {
                if (distanceSquared < 0.0001) {
                  const angle = ((i * 0.754877666 + j * 0.569840296) % 1) * TAU;
                  dx = Math.cos(angle) * 0.01;
                  dy = Math.sin(angle) * 0.01;
                  distanceSquared = 0.0001;
                }

                const distance = Math.sqrt(distanceSquared);
                const normalX = dx / distance;
                const normalY = dy / distance;
                const weight = 1 - distance * inverseRadius;
                const pressure = (this.pressure[i] + this.pressure[j]) * 0.5;
                const nearPressure = (this.nearPressure[i] + this.nearPressure[j]) * 0.5;
                let displacement = dtSquared * (
                  pressure * weight + nearPressure * weight * weight
                ) * 0.5;

                displacement = clamp(
                  displacement,
                  -maximumPairDisplacement * 0.2,
                  maximumPairDisplacement,
                );

                const moveX = normalX * displacement;
                const moveY = normalY * displacement;
                correctionX[i] += moveX;
                correctionY[i] += moveY;
                correctionX[j] -= moveX;
                correctionY[j] -= moveY;
              }
            }
            j = this.nextParticle[j];
          }
        }
      }
    }

    // Pair corrections used to be applied immediately. In a dense pile, a
    // particle could receive dozens of individually valid corrections and be
    // launched across the viewport. Accumulating against one position state
    // makes the solve order-independent; the total cap prevents pressure from
    // becoming an unbounded velocity impulse on slower mobile frames.
    const maximumTotalSquared = maximumTotalDisplacement ** 2;
    for (let i = 0; i < count; i += 1) {
      let moveX = correctionX[i];
      let moveY = correctionY[i];
      const lengthSquared = moveX * moveX + moveY * moveY;

      if (lengthSquared > maximumTotalSquared) {
        const scale = maximumTotalDisplacement / Math.sqrt(lengthSquared);
        moveX *= scale;
        moveY *= scale;
      }

      this.x[i] += moveX;
      this.y[i] += moveY;
    }
  }

  _constrainPositions() {
    const min = this.boundaryPadding;
    const maxX = Math.max(min, this.width - min);
    const maxY = Math.max(min, this.height - min);

    for (let i = 0; i < this.count; i += 1) {
      let flags = 0;

      if (this.x[i] < min) {
        this.x[i] = min;
        flags |= 1;
      } else if (this.x[i] > maxX) {
        this.x[i] = maxX;
        flags |= 2;
      }

      if (this.y[i] < min) {
        this.y[i] = min;
        flags |= 4;
      } else if (this.y[i] > maxY) {
        this.y[i] = maxY;
        flags |= 8;
      }

      this.collisionFlags[i] = flags;
    }
  }

  _updateVelocities(dt) {
    const inverseDt = 1 / dt;
    const limit = this.velocityLimit;

    for (let i = 0; i < this.count; i += 1) {
      let velocityX = (this.x[i] - this.previousX[i]) * inverseDt;
      let velocityY = (this.y[i] - this.previousY[i]) * inverseDt;
      const speedSquared = velocityX * velocityX + velocityY * velocityY;
      const limitSquared = limit * limit;

      if (speedSquared > limitSquared) {
        const scale = limit / Math.sqrt(speedSquared);
        velocityX *= scale;
        velocityY *= scale;
      }
      const flags = this.collisionFlags[i];

      if ((flags & 1 && velocityX < 0) || (flags & 2 && velocityX > 0)) {
        velocityX *= -0.18;
      }
      if ((flags & 4 && velocityY < 0) || (flags & 8 && velocityY > 0)) {
        velocityY *= -0.12;
      }

      this.vx[i] = velocityX;
      this.vy[i] = velocityY;
    }
  }

  // Playground extension: static polyline capsules, CCD, pool drain.
  setCapsules(segments, radius = this.capsuleRadius) {
    this.capsules = Array.isArray(segments) ? segments : [];
    if (Number.isFinite(radius)) {
      this.capsuleRadius = Math.max(4, radius);
    }
    this.lastSign.fill(0);
    if (this.count > 0) {
      this._collideCapsules(1 / 60);
    }
  }

  setFloor(y) {
    this.floorY = Number.isFinite(y) ? y : Number.POSITIVE_INFINITY;
  }

  setView() {
    // CPU solver is world-sized; the renderer applies the camera.
  }

  removeAt(index) {
    const last = this.count - 1;
    if (index < 0 || index > last) {
      return;
    }
    if (index !== last) {
      this.x[index] = this.x[last];
      this.y[index] = this.y[last];
      this.previousX[index] = this.previousX[last];
      this.previousY[index] = this.previousY[last];
      this.vx[index] = this.vx[last];
      this.vy[index] = this.vy[last];
      this.collisionFlags[index] = this.collisionFlags[last];
    }
    this.count -= 1;
  }

  drainBelow(floorY, onDrain) {
    for (let i = this.count - 1; i >= 0; i -= 1) {
      if (this.y[i] >= floorY) {
        const x = this.x[i];
        const energy = Math.hypot(this.vx[i], this.vy[i]);
        this.removeAt(i);
        if (onDrain) {
          onDrain(x, energy);
        }
      }
    }
  }

  _closestSegSeg(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) {
    const ux = p2x - p1x;
    const uy = p2y - p1y;
    const vx = q2x - q1x;
    const vy = q2y - q1y;
    const wx = p1x - q1x;
    const wy = p1y - q1y;
    const a = ux * ux + uy * uy;
    const b = ux * vx + uy * vy;
    const c = vx * vx + vy * vy;
    const d = ux * wx + uy * wy;
    const e = vx * wx + vy * wy;
    const D = a * c - b * b;
    let sN;
    let sD = D;
    let tN;
    let tD = D;
    if (D < 1e-8) {
      sN = 0;
      sD = 1;
      tN = e;
      tD = c;
    } else {
      sN = b * e - c * d;
      tN = a * e - b * d;
      if (sN < 0) {
        sN = 0;
        tN = e;
        tD = c;
      } else if (sN > sD) {
        sN = sD;
        tN = e + b;
        tD = c;
      }
    }
    if (tN < 0) {
      tN = 0;
      if (-d < 0) sN = 0;
      else if (-d > a) sN = sD;
      else {
        sN = -d;
        sD = a;
      }
    } else if (tN > tD) {
      tN = tD;
      if (-d + b < 0) sN = 0;
      else if (-d + b > a) sN = sD;
      else {
        sN = -d + b;
        sD = a;
      }
    }
    const sc = Math.abs(sD) < 1e-8 ? 0 : sN / sD;
    const tc = Math.abs(tD) < 1e-8 ? 0 : tN / tD;
    const dx = wx + sc * ux - tc * vx;
    const dy = wy + sc * uy - tc * vy;
    return { d: Math.hypot(dx, dy), sc, tc };
  }

  _collideCapsules(dt = 1 / 60) {
    const capsules = this.capsules;
    if (!capsules.length || this.count === 0) {
      this.hitEnergy = 0;
      return;
    }
    const rad = this.capsuleRadius;
    const step = Math.max(dt, 1 / 240);
    let peak = 0;
    const maxSegs = Math.min(capsules.length, 160);

    for (let i = 0; i < this.count; i += 1) {
      const fromX = this.previousX[i];
      const fromY = this.previousY[i];
      for (let s = 0; s < maxSegs; s += 1) {
        const g = capsules[s];
        const ax = g.ax;
        const ay = g.ay;
        const bx = g.bx;
        const by = g.by;
        const swept = this._closestSegSeg(fromX, fromY, this.x[i], this.y[i], ax, ay, bx, by);
        const abx = bx - ax;
        const aby = by - ay;
        const abLen2 = abx * abx + aby * aby || 1;
        let t = ((this.x[i] - ax) * abx + (this.y[i] - ay) * aby) / abLen2;
        t = clamp(t, 0, 1);
        const cx = ax + abx * t;
        const cy = ay + aby * t;
        const px = this.x[i] - cx;
        const py = this.y[i] - cy;
        const dist = Math.hypot(px, py);
        const t0 = clamp(((fromX - ax) * abx + (fromY - ay) * aby) / abLen2, 0, 1);

        let nx = aby;
        let ny = -abx;
        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;
        if ((fromX - ax) * nx + (fromY - ay) * ny < 0) {
          nx = -nx;
          ny = -ny;
        }
        const atEnd = t <= 0.04 || t >= 0.96 || t0 <= 0.04 || t0 >= 0.96;
        if (atEnd && dist > 1e-5) {
          let rx = px / dist;
          let ry = py / dist;
          if (rx * (fromX - cx) + ry * (fromY - cy) < 0) {
            rx = -rx;
            ry = -ry;
          }
          nx = rx;
          ny = ry;
        }

        if (swept.d < rad || dist < rad) {
          const distNow = (this.x[i] - cx) * nx + (this.y[i] - cy) * ny;
          const pen = rad - distNow;
          if (pen > 0) {
            this.x[i] += nx * pen;
            this.y[i] += ny * pen;
          }
          const vn = this.vx[i] * nx + this.vy[i] * ny;
          if (vn < 0) {
            const flat = Math.abs(abx) > Math.abs(aby) * 2.2;
            const rest = flat ? 0.18 : 0.03;
            this.vx[i] -= (1 + rest) * vn * nx;
            this.vy[i] -= (1 + rest) * vn * ny;
            if (flat) {
              const midX = (ax + bx) * 0.5;
              this.vx[i] += (this.x[i] >= midX ? 1 : -1) * 42;
              this.vy[i] *= 0.72;
            } else {
              const tlen = Math.sqrt(abLen2);
              const tx = abx / tlen;
              const ty = aby / tlen;
              const along = this.vx[i] * tx + this.vy[i] * ty;
              this.vx[i] = tx * along * 0.97;
              this.vy[i] = ty * along * 0.97;
            }
            if (-vn > peak) {
              peak = -vn;
            }
            this.collisionFlags[i] |= 16;
            this.previousX[i] = this.x[i] - this.vx[i] * step;
            this.previousY[i] = this.y[i] - this.vy[i] * step;
          }
        }

        const side0 = Math.sign((bx - ax) * (fromY - ay) - (by - ay) * (fromX - ax)) || 1;
        const side1 = Math.sign((bx - ax) * (this.y[i] - ay) - (by - ay) * (this.x[i] - ax)) || 1;
        const through = t0 > 0.06 && t0 < 0.94 && t > 0.06 && t < 0.94 && swept.tc > 0.06 && swept.tc < 0.94;
        if (through && side0 !== side1) {
          this.crossings += 1;
        }
      }
    }
    this.hitEnergy = peak;
  }

}
