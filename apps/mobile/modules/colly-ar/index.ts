import { requireOptionalNativeModule } from "expo";

// The AR screen: ARKit on iOS, ARCore on Android. Null in builds made before the module existed.
export default requireOptionalNativeModule<{
  present(imageUrls: string[], korean: boolean): Promise<void>;
  /** Android only: whether this phone supports ARCore. */
  isAvailable?: () => boolean;
}>("CollyAr");
