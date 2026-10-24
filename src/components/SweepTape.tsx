// SweepTape — the log-frequency strip with a needle, rendered with SVG.
// Mobile adaptation of the site's SweepStrip: larger hit area, a grab handle,
// and band locators so existing filters show up on the tape while you sweep.
//
// Performance: drag events are coalesced to one commit per animation frame and
// the static graphics (ticks, labels, band marks) live in a memoized subtree,
// so moving the needle re-renders two SVG nodes, not the whole tape.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";
import {
  clampFreq,
  fmtK,
  freqToX,
  MAJOR_TICKS,
  MINOR_TICKS,
  xToFreq,
} from "../lib/dsp.ts";
import { type Band, type Draft } from "../lib/store.ts";
import { type Palette } from "../theme/theme.ts";

const HEIGHT = 132;
const LABEL_H = 22;
const BASE_INSET = 30;
const MINOR_H = 10;
const MAJOR_H = 18;
const NEEDLE_TOP = 10;

interface Props {
  freq: number;
  bands: Band[];
  selectedId: string | null;
  draft: Draft;
  playing: boolean;
  pal: Palette;
  onFreq: (hz: number) => void;
  onEngage: () => void;
  onRelease?: () => void;
  style?: StyleProp<ViewStyle>;
}

const anchors = new Map<number, { anchor: "start" | "middle" | "end"; dx: number }>();
for (const f of MAJOR_TICKS) {
  if (f === MAJOR_TICKS[0]) anchors.set(f, { anchor: "start", dx: 2 });
  else if (f === MAJOR_TICKS[MAJOR_TICKS.length - 1]) anchors.set(f, { anchor: "end", dx: -2 });
  else anchors.set(f, { anchor: "middle", dx: 0 });
}

interface StaticProps {
  width: number;
  bands: Band[];
  selectedId: string | null;
  draft: Draft;
  pal: Palette;
}

// Everything except the needle. Palette objects are stable per mode, and the
// store updates bands/draft immutably, so this subtree stays put while the
// user drags.
const TapeStatic = memo(function TapeStatic({ width, bands, selectedId, draft, pal }: StaticProps) {
  const base = HEIGHT - BASE_INSET;
  return (
    <G>
      {/* band locators */}
      {bands.map((b, i) => {
        const x = freqToX(b.fc, width);
        return (
          <Rect
            key={`band-${b.id}-${i}`}
            x={x - 1.4}
            y={4}
            width={2.8}
            height={16}
            rx={1.4}
            fill={b.id === selectedId ? pal.primary : pal.outline}
          />
        );
      })}

      {/* draft marks as dots on the tape */}
      {(["start", "top", "end"] as const).map((k) => {
        const v = draft[k];
        if (v == null) return null;
        const x = freqToX(v, width);
        return <Circle key={`draft-${k}`} cx={x} cy={base - 26} r={3.6} fill={pal.tertiary} />;
      })}

      {/* minor ticks */}
      {MINOR_TICKS.map((f) => {
        const x = freqToX(f, width);
        return (
          <Line
            key={`minor-${f}`}
            x1={x}
            y1={base - MINOR_H}
            x2={x}
            y2={base}
            stroke={pal.outlineVariant}
            strokeWidth={1}
          />
        );
      })}

      {/* major ticks + labels */}
      {MAJOR_TICKS.map((f) => {
        const x = freqToX(f, width);
        const a = anchors.get(f) || { anchor: "middle" as const, dx: 0 };
        return (
          <G key={`major-${f}`}>
            <Line x1={x} y1={base - MAJOR_H} x2={x} y2={base} stroke={pal.onSurfaceVariant} strokeWidth={1} />
            <SvgText
              x={x + a.dx}
              y={base + LABEL_H - 8}
              textAnchor={a.anchor}
              fontSize={11}
              fill={pal.onSurfaceVariant}
            >
              {fmtK(f)}
            </SvgText>
          </G>
        );
      })}

      {/* baseline */}
      <Line x1={0} y1={base} x2={width} y2={base} stroke={pal.outline} strokeWidth={1} />
    </G>
  );
});

const Needle = memo(function Needle({ x, playing, pal }: { x: number; playing: boolean; pal: Palette }) {
  const base = HEIGHT - BASE_INSET;
  const cy = NEEDLE_TOP + 10;
  // The line starts at the dot's centre so the dot caps the needle cleanly
  // (no antenna poking out above the handle).
  return (
    <G>
      <Line x1={x} y1={cy} x2={x} y2={base + 2} stroke={pal.onSurface} strokeWidth={2} />
      <Circle
        cx={x}
        cy={cy}
        r={playing ? 9 : 7}
        fill={pal.tertiary}
        stroke={pal.onTertiary}
        strokeWidth={playing ? 2 : 0}
      />
    </G>
  );
});

function SweepTapeInner({
  freq,
  bands,
  selectedId,
  draft,
  playing,
  pal,
  onFreq,
  onEngage,
  onRelease,
  style,
}: Props) {
  const [width, setWidth] = useState(0);
  const bridge = useRef({ width: 0, onFreq, onEngage, onRelease });
  // Keep the broker fresh without touching refs during render.
  useEffect(() => {
    bridge.current = { width, onFreq, onEngage, onRelease };
  }, [width, onFreq, onEngage, onRelease]);

  const pageXOffset = useRef<number>(0);
  const rafId = useRef<number | null>(null);
  const pendingHz = useRef<number | null>(null);
  // Dev-only gesture telemetry: tells us whether touch delivery, frame
  // scheduling, or the bridge is the bottleneck during a sweep.
  const dragStats = useRef({
    moves: 0,
    frames: 0,
    maxMoveGap: 0,
    maxRafGap: 0,
    lastMoveAt: 0,
    lastFrameAt: 0,
  });

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.max(0, Math.floor(e.nativeEvent.layout.width));
    setWidth(w);
  }, []);

  const measureWrap = useCallback(
    (ref: { measureInWindow(cb: (x: number, y: number, w: number, h: number) => void): void } | null) => {
      // RN 0.88 element API: measureInWindow(x, y, w, h) — x is the
      // window-relative origin we need to turn page hits into tape coords.
      ref?.measureInWindow((x) => {
        pageXOffset.current = x;
      });
    },
    []
  );

  // One frequency commit per animation frame keeps the store/React work at
  // display rate even on 120+ Hz touch sampling.
  const emitFreq = useCallback((hz: number) => {
    pendingHz.current = hz;
    if (rafId.current != null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const v = pendingHz.current;
      pendingHz.current = null;
      if (v != null) {
        if (__DEV__) {
          const st = dragStats.current;
          const now = Date.now();
          if (st.lastFrameAt > 0) {
            st.maxRafGap = Math.max(st.maxRafGap, now - st.lastFrameAt);
          }
          st.lastFrameAt = now;
          st.frames += 1;
        }
        bridge.current.onFreq(v);
      }
    });
  }, []);

  const flushFreq = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    const v = pendingHz.current;
    pendingHz.current = null;
    if (v != null) bridge.current.onFreq(v);
  }, []);

  useEffect(
    () => () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    },
    []
  );

  // Anchor the gesture in window coordinates once, on touch-down, instead of
  // trusting locationX for every move. On Android locationX is relative to
  // whichever native view the event targets, so dragging across neighbouring
  // controls (chips, buttons) makes locationX jump to a tiny value and the
  // tape slams to the left edge. pageX is absolute, so pageX - origin stays
  // stable no matter what the finger passes over.
  const captureOrigin = useCallback((evt: { locationX?: number; pageX: number }) => {
    if (typeof evt.locationX === "number" && evt.locationX >= 0 && evt.pageX > 0) {
      pageXOffset.current = evt.pageX - evt.locationX;
    }
  }, []);

  const touchX = useCallback((evt: { pageX: number }): number => evt.pageX - pageXOffset.current, []);

  const noteMove = useCallback(() => {
    if (!__DEV__) return;
    const st = dragStats.current;
    const now = Date.now();
    if (st.lastMoveAt > 0) st.maxMoveGap = Math.max(st.maxMoveGap, now - st.lastMoveAt);
    st.lastMoveAt = now;
    st.moves += 1;
  }, []);

  const resetDragStats = useCallback(() => {
    if (!__DEV__) return;
    dragStats.current = {
      moves: 0,
      frames: 0,
      maxMoveGap: 0,
      maxRafGap: 0,
      lastMoveAt: 0,
      lastFrameAt: 0,
    };
  }, []);

  const logDragStats = useCallback(() => {
    if (!__DEV__) return;
    const st = dragStats.current;
    if (st.moves === 0 && st.frames === 0) return;
    console.log(
      `[eqdebug] drag moves=${st.moves} maxMoveGap=${st.maxMoveGap}ms frames=${st.frames} maxFrameGap=${st.maxRafGap}ms`
    );
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          resetDragStats();
          captureOrigin(e.nativeEvent);
          const w = bridge.current.width;
          const x = touchX(e.nativeEvent);
          if (w > 0 && x >= 0) {
            emitFreq(clampFreq(xToFreq(x, w)));
          }
          bridge.current.onEngage();
        },
        onPanResponderMove: (e) => {
          noteMove();
          const w = bridge.current.width;
          const x = touchX(e.nativeEvent);
          if (w > 0 && x >= 0) {
            emitFreq(clampFreq(xToFreq(x, w)));
          }
        },
        onPanResponderRelease: () => {
          logDragStats();
          flushFreq();
          bridge.current.onRelease?.();
        },
        onPanResponderTerminate: () => {
          logDragStats();
          flushFreq();
          bridge.current.onRelease?.();
        },
      }),
    [emitFreq, flushFreq, captureOrigin, touchX, noteMove, resetDragStats, logDragStats]
  );

  const needleX = width > 0 ? freqToX(freq, width) : 0;

  return (
    <View style={[style, { height: HEIGHT }]} onLayout={onLayout}>
      <View
        ref={measureWrap}
        style={{ flex: 1 }}
        {...pan.panHandlers}
        accessible
        accessibilityLabel="Frequency tape. Tap or drag to sweep the tone."
        accessibilityRole="adjustable"
      >
        {width > 0 && (
          <Svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
            <TapeStatic
              width={width}
              bands={bands}
              selectedId={selectedId}
              draft={draft}
              pal={pal}
            />
            <Needle x={needleX} playing={playing} pal={pal} />
          </Svg>
        )}
      </View>
    </View>
  );
}

export const SweepTape = memo(SweepTapeInner);
