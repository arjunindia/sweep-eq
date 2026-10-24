// ResponseGraph — the ±12 dB magnitude plot over log frequency.
// Port of the site's Graph (grid, dashed per-band ghosts, sum curve, draft
// dots, band numbers, playhead) re-styled for Material 3, plus a mobile
// affordance: drag or tap the plot to sweep/jump the tone frequency.

import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import {
  clampFreq,
  fmtHz,
  fmtK,
  freqToX,
  magnitudeDb,
  MAJOR_TICKS,
  responseDb,
  sampleFreqs,
  xToFreq,
} from "../lib/dsp.ts";
import { type Band, type Draft } from "../lib/store.ts";
import { type Palette } from "../theme/theme.ts";
import { useFrameCoalesced } from "../hooks/useFrameCoalesced.ts";

const HEIGHT = 208;
const LABEL_STRIP = 26; // bottom strip with frequency labels
const PLOT_H = HEIGHT - LABEL_STRIP;
const RANGE_DB = 12;
const DB_LINES = [-12, -6, 0, 6, 12];
const FREQS = sampleFreqs(288);

const freqAnchors = new Map<number, { anchor: "start" | "middle" | "end"; dx: number }>();
for (const f of MAJOR_TICKS) {
  if (f === MAJOR_TICKS[0]) freqAnchors.set(f, { anchor: "start", dx: 2 });
  else if (f === MAJOR_TICKS[MAJOR_TICKS.length - 1]) freqAnchors.set(f, { anchor: "end", dx: -2 });
  else freqAnchors.set(f, { anchor: "middle", dx: 0 });
}

interface Props {
  freq: number;
  bands: Band[];
  selectedId: string | null;
  draft: Draft;
  pal: Palette;
  onFreq?: (hz: number) => void;
  onEngage?: () => void;
  onRelease?: () => void;
  style?: StyleProp<ViewStyle>;
}

function yAt(db: number): number {
  const c = PLOT_H / 2;
  const v = Math.max(-RANGE_DB, Math.min(RANGE_DB, db));
  return c - (v / RANGE_DB) * c;
}

function pathFor(fn: (f: number) => number, width: number): string {
  let d = "";
  for (let i = 0; i < FREQS.length; i++) {
    const f = FREQS[i];
    d += (i ? " L" : "M") + freqToX(f, width).toFixed(1) + "," + yAt(fn(f)).toFixed(1);
  }
  return d;
}

function ResponseGraphInner({ freq, bands, selectedId, draft, pal, onFreq, onEngage, onRelease, style }: Props) {
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(Math.max(0, Math.floor(e.nativeEvent.layout.width)));
  }, []);

  const on = useMemo(() => bands.filter((b) => b.enabled !== false), [bands]);
  const sum = useCallback((f: number) => responseDb(bands, f), [bands]);

  // Curve geometry only depends on the bands and the width. Rebuilding these
  // 288-point paths on every frequency tick would make the playhead stutter.
  const sumPath = useMemo(
    () => (width > 0 ? pathFor((f) => responseDb(bands, f), width) : ""),
    [bands, width]
  );
  const ghostPaths = useMemo(
    () =>
      width > 0
        ? on.map((b) => ({ id: b.id, d: pathFor((f) => magnitudeDb(b, f), width) }))
        : [],
    [on, width]
  );

  const { emit, flush } = useFrameCoalesced<number>(
    useCallback(
      (x: number) => {
        if (width <= 0) return;
        const clamped = Math.max(0, Math.min(width, x));
        onFreq?.(clampFreq(xToFreq(clamped, width)));
      },
      [onFreq, width]
    )
  );

  // Same anchoring as the tape: capture the plot origin on touch-down (while
  // locationX is still relative to the plot) and track absolute pageX
  // afterwards. locationX is relative to the native view under the finger and
  // goes wrong as soon as the drag crosses another view.
  const originRef = useRef(0);
  const tapX = useRef<number | null>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        // This plot lives inside the Curve scroll view: claim only deliberate
        // horizontal drags so a vertical swipe still scrolls. Taps are handled
        // by the Pressable child.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
        onPanResponderGrant: (e) => {
          onEngage?.();
          emit(e.nativeEvent.pageX - originRef.current);
        },
        onPanResponderMove: (e) => emit(e.nativeEvent.pageX - originRef.current),
        onPanResponderRelease: () => {
          flush();
          onRelease?.();
        },
        onPanResponderTerminate: () => {
          flush();
          onRelease?.();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [emit, flush, onEngage, onRelease]
  );

  const playheadX = width > 0 ? freqToX(freq, width) : 0;

  return (
    <View style={[style, { height: HEIGHT }]} onLayout={onLayout}>
      {width > 0 && (
        <View style={{ flex: 1 }} {...pan.panHandlers}>
          <Pressable
            style={{ flex: 1 }}
            onPressIn={(e) => {
              // locationX is trustworthy here: this fires on touch-down while
              // the Pressable itself is the targeted view.
              const { pageX, locationX } = e.nativeEvent;
              tapX.current = locationX;
              if (pageX > 0 && locationX >= 0) originRef.current = pageX - locationX;
            }}
            onPress={() => {
              const x = tapX.current;
              if (x == null || width <= 0) return;
              onEngage?.();
              onFreq?.(clampFreq(xToFreq(Math.max(0, Math.min(width, x)), width)));
              onRelease?.();
            }}
            accessible
            accessibilityLabel="Response curve. Drag or tap to set the tone frequency."
            accessibilityRole="adjustable"
          >
          <Svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
            {/* vertical hairlines */}
            {MAJOR_TICKS.map((f) => {
              const x = freqToX(f, width);
              return (
                <Line
                  key={`gv-${f}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={PLOT_H}
                  stroke={pal.outlineVariant}
                  strokeWidth={1}
                />
              );
            })}

            {/* frequency labels under the plot */}
            {MAJOR_TICKS.map((f) => {
              const x = freqToX(f, width);
              const a = freqAnchors.get(f) || { anchor: "middle" as const, dx: 0 };
              return (
                <SvgText
                  key={`gl-${f}`}
                  x={x + a.dx}
                  y={HEIGHT - 8}
                  textAnchor={a.anchor}
                  fontSize={11}
                  fill={pal.onSurfaceVariant}
                >
                  {fmtK(f)}
                </SvgText>
              );
            })}

            {/* horizontal dB lines */}
            {DB_LINES.map((db) => (
              <Line
                key={`gd-${db}`}
                x1={0}
                y1={yAt(db)}
                x2={width}
                y2={yAt(db)}
                stroke={db === 0 ? pal.outline : pal.outlineVariant}
                strokeWidth={db === 0 ? 1.5 : 1}
              />
            ))}
            {DB_LINES.filter((db) => db !== 0).map((db) => (
              <SvgText
                key={`gn-${db}`}
                x={5}
                y={db > 0 ? yAt(db) - 5 : yAt(db) + 13}
                textAnchor="start"
                fontSize={10}
                fill={pal.onSurfaceVariant}
              >
                {(db > 0 ? "+" : "\u2212") + Math.abs(db) + " dB"}
              </SvgText>
            ))}

            {/* one dashed ghost per enabled band */}
            {ghostPaths.map((g) => (
              <Path
                key={`ghost-${g.id}`}
                d={g.d}
                fill="none"
                stroke={pal.onSurfaceVariant}
                strokeWidth={1}
                strokeDasharray="1 3"
                opacity={0.55}
              />
            ))}

            {/* the summed curve */}
            <Path
              d={sumPath}
              fill="none"
              stroke={pal.primary}
              strokeWidth={2.2}
              strokeLinejoin="round"
            />

            {(["start", "top", "end"] as const).map((k, i) => {
              const f = draft[k];
              if (f == null) return null;
              const x = freqToX(f, width);
              const y = yAt(sum(f));
              const anchor = i === 0 ? "end" : i === 1 ? "middle" : "start";
              const lx = x + (i === 0 ? -7 : i === 2 ? 7 : 0);
              const ly = i === 1 ? y - 9 : y - 6;
              return (
                <G key={`df-${k}`}>
                  <Circle cx={x} cy={y} r={4} fill={pal.tertiary} />
                  <SvgText
                    x={lx}
                    y={ly}
                    textAnchor={anchor}
                    fontSize={10.5}
                    fill={pal.onSurface}
                  >
                    {`${k} ${fmtK(f)}`}
                  </SvgText>
                </G>
              );
            })}

            {/* band numbers above the frequency labels */}
            {bands.map((b, i) => {
              const x = freqToX(b.fc, width);
              return (
                <SvgText
                  key={`bn-${b.id}-${i}`}
                  x={x}
                  y={HEIGHT - 22}
                  textAnchor="middle"
                  fontSize={11}
                  fill={b.id === selectedId ? pal.primary : pal.onSurfaceVariant}
                >
                  {String(i + 1)}
                </SvgText>
              );
            })}

            {/* playhead */}
            <Line x1={playheadX} y1={0} x2={playheadX} y2={PLOT_H} stroke={pal.tertiary} strokeWidth={1.5} />

            {/* current frequency label duplicated at top for glanceability */}
            <SvgText
              x={Math.min(width - 4, Math.max(4, playheadX))}
              y={11}
              textAnchor="middle"
              fontSize={10.5}
              fill={pal.onSurface}
              opacity={0.85}
            >
              {fmtHz(freq) + " Hz"}
            </SvgText>
          </Svg>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export const ResponseGraph = memo(ResponseGraphInner);
