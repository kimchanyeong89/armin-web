import ExpoModulesCore
import UIKit

public class CollyArModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CollyAr")

    // Opens the AR screen over the app. `imageUrls` are tried in order until one loads.
    AsyncFunction("present") { (imageUrls: [String], korean: Bool) in
      let urls = imageUrls.compactMap { URL(string: $0) }
      var top = UIApplication.shared.connectedScenes
        .compactMap { ($0 as? UIWindowScene)?.windows.first(where: { $0.isKeyWindow }) }
        .first?.rootViewController
      while let presented = top?.presentedViewController { top = presented }
      top?.present(CollyArViewController(imageUrls: urls, korean: korean), animated: true)
    }.runOnQueue(.main)
  }
}
