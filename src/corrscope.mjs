export function createCorrscope({
  maxKernel = 1024,
  maxData = 16384,
  RING_BUFFER_MASK = 0xFFFF,
  ringRead, // function(dstArray, dstOffset, ringStart, count)
}) {
  if (typeof ringRead !== 'function') {
    throw new Error('createCorrscope requires ringRead(rdst, dstOff, ringStart, count)');
  }

  const MIN_AMPLITUDE = 0.1;
  const MAX_KERNEL = maxKernel;
  const MAX_DATA = maxData;

  const workTriggerData = new Float32Array(MAX_DATA);
  const workAutocorrBuffer = new Float32Array(MAX_DATA);
  const workSlopeKernel = new Float32Array(MAX_KERNEL);
  const workCombinedKernel = new Float32Array(MAX_KERNEL);
  const workCorrelationResult = new Float32Array(MAX_DATA);
  const workCorrQuality = new Float32Array(MAX_DATA);
  const workPeaks = new Float32Array(MAX_DATA);
  const workWindow = new Float32Array(MAX_KERNEL);
  const workNewBuf = new Float32Array(MAX_KERNEL);
  const workEdgeScores = new Float32Array(MAX_DATA);
  const prevWindowArr = new Float32Array(MAX_KERNEL);

  let corrBuffer = new Float32Array(MAX_KERNEL).fill(0);
  let prevMean = 0;
  let prevPeriod = 0;
  let prevSlopeFinder = null;
  let prevSlopeFinderLen = 0;

  function resetCorrState() {
    corrBuffer.fill(0);
    prevMean = 0;
    prevPeriod = 0;
    prevSlopeFinder = null;
    prevSlopeFinderLen = 0;
  }

  function absMax(arr, len, floor) {
    let mx = floor || 0;
    for (let i = 0; i < len; i++) {
      const v = Math.abs(arr[i]);
      if (v > mx) mx = v;
    }
    return mx;
  }

  function normalizeBufferInPlace(buf, len) {
    const peak = absMax(buf, len, 0);
    if (peak < MIN_AMPLITUDE) {
      for (let i = 0; i < len; i++) buf[i] = 0;
      return;
    }
    const scale = 1.0 / peak;
    for (let i = 0; i < len; i++) buf[i] *= scale;
  }

  function gaussianWindowInto(dst, N, std) {
    if (std <= 0) {
      for (let i = 0; i < N; i++) dst[i] = 0;
      return;
    }
    const mid = (N - 1) / 2;
    for (let i = 0; i < N; i++) {
      const x = (i - mid) / std;
      dst[i] = Math.exp(-0.5 * x * x);
    }
  }

  function correlateValidInto(out, data, dataLen, kernel, kernelLen) {
    const outLen = dataLen - kernelLen + 1;
    if (outLen <= 0) return 0;
    for (let i = 0; i < outLen; i++) {
      let sum = 0;
      for (let j = 0; j < kernelLen; j++) {
        sum += data[i + j] * kernel[j];
      }
      out[i] = sum;
    }
    return outLen;
  }

  function estimatePeriod(data, dataLen, sampleRate, maxFreq) {
    if (dataLen < 4) return 0;
    const minPeriod = Math.max(2, Math.floor(sampleRate / maxFreq));
    const maxPeriod = Math.floor(dataLen / 2);
    if (minPeriod >= maxPeriod) return 0;

    let energy = 0;
    for (let i = 0; i < dataLen; i++) energy += data[i] * data[i];
    if (energy < MIN_AMPLITUDE * MIN_AMPLITUDE * dataLen) return 0;

    let bestLag = 0, bestCorr = -Infinity;
    const effectiveMaxPeriod = Math.min(maxPeriod, 1024);
    for (let lag = minPeriod; lag <= effectiveMaxPeriod; lag++) {
      let sum = 0, e1 = 0, e2 = 0;
      const len = dataLen - lag;
      for (let i = 0; i < len; i++) {
        sum += data[i] * data[i + lag];
        e1 += data[i] * data[i];
        e2 += data[i + lag] * data[i + lag];
      }
      const denom = Math.sqrt(e1 * e2);
      const corr = denom > 0 ? sum / denom : 0;
      if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
    }
    if (bestCorr < 0.3) return 0;
    return bestLag;
  }

  function calcSlopeFinderInto(dst, kernelSize, period, slopeWidth, edgeStrength) {
    const A = Math.floor(kernelSize / 2);
    const sw = Math.max(1.0, Math.min(slopeWidth * period, A / 3));
    const strength = edgeStrength * 2;
    for (let i = 0; i < kernelSize; i++) {
      dst[i] = (i < A) ? -strength / 2 : strength / 2;
    }
    gaussianWindowInto(workWindow, kernelSize, sw);
    for (let i = 0; i < kernelSize; i++) dst[i] *= workWindow[i];
  }

  function findCorrscopePeak(corr, peaks, N, radius) {
    if (N <= 0) return 0;
    const mid = Math.floor(N / 2);

    let left = 0, right = N;
    if (radius !== null && radius !== undefined) {
      left = Math.max(0, mid - radius);
      right = Math.min(N, mid + radius + 1);
    }

    const sliceLen = right - left;
    if (sliceLen <= 0) return mid;

    let minCorr = Infinity;
    for (let i = left; i < right; i++) {
      if (i < N && corr[i] < minCorr) minCorr = corr[i];
    }

    for (let i = 0; i < sliceLen; i++) {
      const gi = left + i;
      workEdgeScores[i] = (gi < N) ? corr[gi] : 0;
    }

    for (let i = 0; i < sliceLen - 1; i++) {
      const gi = left + i;
      const gn = left + i + 1;
      if (gi < N && gn < N && peaks[gi] < peaks[gn]) workEdgeScores[i] = minCorr;
    }
    for (let i = 1; i < sliceLen; i++) {
      const gi = left + i;
      const gp = left + i - 1;
      if (gi < N && gp < N && peaks[gi] < peaks[gp]) workEdgeScores[i] = minCorr;
    }
    workEdgeScores[0] = minCorr;
    if (sliceLen > 1) workEdgeScores[sliceLen - 1] = minCorr;

    let bestIdx = 0, bestVal = -Infinity;
    for (let i = 0; i < sliceLen; i++) {
      if (workEdgeScores[i] > bestVal) { bestVal = workEdgeScores[i]; bestIdx = i; }
    }

    if (bestVal <= minCorr) return mid;
    return bestIdx + left;
  }

  function trigger(readStart, displaySamples, params = {}) {
    const {
      sampleRate = 48000,
      edgeStrength = 0.8,
      bufferStrength = 0.8,
      responsiveness = 0.2,
      slopeWidth = 0.5,
      bufferFalloff = 0.5,
      resetBelow = 0.2,
      maxFreq = 4000
    } = params;

    const kernelSize = Math.min(displaySamples, MAX_KERNEL);
    const A = Math.floor(kernelSize / 2);
    const triggerDiameter = Math.floor(kernelSize * 0.5);
    const dataNSamp = Math.min(kernelSize + triggerDiameter, MAX_DATA);

    ringRead(workTriggerData, 0, readStart & RING_BUFFER_MASK, dataNSamp);

    let mean = 0;
    for (let i = 0; i < dataNSamp; i++) mean += workTriggerData[i];
    mean /= dataNSamp;
    prevMean += 1.0 * (mean - prevMean);

    for (let i = 0; i < dataNSamp; i++) {
      workAutocorrBuffer[i] = workTriggerData[i] - mean;
    }
    for (let i = 0; i < dataNSamp; i++) {
      workTriggerData[i] -= prevMean;
    }

    const period = estimatePeriod(workAutocorrBuffer, dataNSamp, sampleRate, maxFreq);
    const effectivePeriod = period > 0 ? period : Math.floor(kernelSize / 4);

    if (!prevSlopeFinder || prevSlopeFinderLen !== kernelSize || prevPeriod === 0 || period === 0 ||
        Math.abs(Math.log(effectivePeriod / Math.max(1, prevPeriod)) / Math.log(2) * 12) > 1.0) {
      calcSlopeFinderInto(workSlopeKernel, kernelSize, effectivePeriod, slopeWidth, edgeStrength);
      if (!prevSlopeFinder || prevSlopeFinder.length !== kernelSize) {
        prevSlopeFinder = new Float32Array(kernelSize);
      }
      prevSlopeFinder.set(workSlopeKernel.subarray(0, kernelSize));
      prevSlopeFinderLen = kernelSize;
      prevPeriod = effectivePeriod;
    } else {
      for (let i = 0; i < kernelSize; i++) workSlopeKernel[i] = prevSlopeFinder[i];
    }

    const corrNSamp = triggerDiameter + 1;

    let corrEnabled = (bufferStrength > 0) && (responsiveness > 0);
    let corrQualityLen = 0;

    if (corrEnabled) {
      corrQualityLen = correlateValidInto(workCorrQuality, workTriggerData, dataNSamp, corrBuffer, kernelSize);

      if (resetBelow > 0 && corrQualityLen > 0) {
        let peakIdx = 0, peakVal = -Infinity;
        for (let i = 0; i < corrQualityLen; i++) {
          if (workCorrQuality[i] > peakVal) { peakVal = workCorrQuality[i]; peakIdx = i; }
        }

        let selfQual = 0;
        for (let i = 0; i < kernelSize && (peakIdx + i) < dataNSamp; i++) {
          const v = workTriggerData[peakIdx + i] - mean;
          selfQual += workTriggerData[peakIdx + i] * v;
        }
        const relativeQuality = peakVal / (selfQual + 0.001);
        if (relativeQuality < resetBelow) {
          corrBuffer.fill(0);
          corrEnabled = false;
          corrQualityLen = 0;
        }
      }
    }

    if (corrEnabled) {
      for (let i = 0; i < kernelSize; i++) {
        workCombinedKernel[i] = workSlopeKernel[i] + corrBuffer[i] * bufferStrength;
      }
    } else {
      for (let i = 0; i < kernelSize; i++) {
        workCombinedKernel[i] = workSlopeKernel[i];
      }
    }

    const corrLen = correlateValidInto(workCorrelationResult, workTriggerData, dataNSamp, workCombinedKernel, kernelSize);

    const peaksLen = Math.min(corrNSamp, corrLen);
    for (let i = 0; i < peaksLen; i++) workPeaks[i] = 0;

    if (corrEnabled && corrQualityLen === peaksLen) {
      for (let i = 0; i < peaksLen; i++) {
        workPeaks[i] = workCorrQuality[i] * bufferStrength;
      }
    }

    if (edgeStrength > 0) {
      let cumSum = 0;
      for (let i = 0; i < peaksLen; i++) {
        if (i > 0) cumSum += workTriggerData[A - 1 + i];
        workPeaks[i] += -edgeStrength * cumSum;
      }
    }

    const triggerRadiusPeriods = 1.5;
    let radius = null;
    if (period > 0) radius = Math.round(period * triggerRadiusPeriods);

    const peakOffset = findCorrscopePeak(workCorrelationResult, workPeaks, peaksLen, radius);

    let qualityScore = 0;
    if (corrQualityLen > peakOffset && peakOffset >= 0) {
      const qMax = absMax(workCorrQuality, corrQualityLen, 0.001);
      qualityScore = workCorrQuality[peakOffset] / qMax;
    } else if (corrLen > peakOffset && peakOffset >= 0) {
      const cMax = absMax(workCorrelationResult, corrLen, 0.001);
      qualityScore = workCorrelationResult[peakOffset] / cMax;
    }

    if (bufferStrength > 0 && responsiveness > 0) {
      for (let i = 0; i < kernelSize; i++) {
        const srcIdx = peakOffset + i;
        workNewBuf[i] = (srcIdx >= 0 && srcIdx < dataNSamp) ? (workTriggerData[srcIdx] - mean) : 0;
      }
      normalizeBufferInPlace(workNewBuf, kernelSize);

      const bufStd = effectivePeriod * bufferFalloff;
      gaussianWindowInto(workWindow, kernelSize, bufStd);
      for (let i = 0; i < kernelSize; i++) workNewBuf[i] *= workWindow[i];
      prevWindowArr.set(workWindow.subarray(0, kernelSize));

      normalizeBufferInPlace(corrBuffer, kernelSize);

      const omt = 1 - responsiveness;
      for (let i = 0; i < kernelSize; i++) {
        corrBuffer[i] = corrBuffer[i] * omt + workNewBuf[i] * responsiveness;
      }
    }

    return { offset: peakOffset, score: qualityScore, dataNSamp: dataNSamp };
  }

  return {
    trigger,
    resetState: resetCorrState,
    _internals: { corrBuffer, workTriggerData, workAutocorrBuffer }
  };
}
