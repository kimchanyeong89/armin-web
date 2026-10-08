package expo.modules.collyar

import android.content.Intent
import com.google.ar.core.ArCoreApk
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CollyArModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CollyAr")

    // False on phones Google's ARCore does not support, so the app shows no AR button there.
    Function("isAvailable") {
      val context = appContext.reactContext
      if (context == null) {
        false
      } else {
        val availability = ArCoreApk.getInstance().checkAvailability(context)
        availability.isSupported || availability.isTransient
      }
    }

    // Opens the AR screen over the app. `imageUrls` are tried in order until one loads.
    AsyncFunction("present") { imageUrls: List<String>, korean: Boolean ->
      val activity = appContext.currentActivity
      if (activity != null) {
        val intent = Intent(activity, CollyArActivity::class.java)
        intent.putStringArrayListExtra(CollyArActivity.EXTRA_IMAGES, ArrayList(imageUrls))
        intent.putExtra(CollyArActivity.EXTRA_KOREAN, korean)
        activity.startActivity(intent)
      }
    }
  }
}
