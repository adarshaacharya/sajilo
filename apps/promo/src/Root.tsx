import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH } from "./theme";
import { TOTAL } from "./timeline";
import { Tour, type TourProps } from "./Tour";

export function Root() {
  return (
    <Composition
      id="Tour"
      component={Tour}
      durationInFrames={TOTAL}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ track: null } satisfies TourProps}
    />
  );
}
