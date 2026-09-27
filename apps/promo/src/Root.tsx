import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH } from "./theme";
import { TOTAL } from "./timeline";
import { Tour, type TourProps } from "./Tour";
import { Vertical } from "./Vertical";
import { V_HEIGHT, V_TOTAL, V_WIDTH } from "./vertical-cut";

export function Root() {
  return (
    <>
      <Composition
        id="Tour"
        component={Tour}
        durationInFrames={TOTAL}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ track: null } satisfies TourProps}
      />
      <Composition
        id="Vertical"
        component={Vertical}
        durationInFrames={V_TOTAL}
        fps={FPS}
        width={V_WIDTH}
        height={V_HEIGHT}
      />
    </>
  );
}
