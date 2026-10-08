import { requireOptionalNativeModule } from "expo";

// iOS only (ARKit); null on Android and in builds made before the module existed.
export default requireOptionalNativeModule<{ present(imageUrls: string[], korean: boolean): Promise<void> }>("CollyAr");
