import ARKit
import Photos
import SceneKit
import UIKit

/// The artwork hung in the room: ARKit finds the surface under a touch (wall, floor,
/// slope) and the picture lies flat on it, staying there as the phone moves.
/// Touch or drag to move it, the side slider for its width, the turn button for 90°
/// steps; the shutter keeps the camera view with the picture and saves it to Photos.
final class CollyArViewController: UIViewController, ARSessionDelegate {
  private static let minWidth: Float = 0.15 // metres
  private static let maxWidth: Float = 3.0
  private static let depth: CGFloat = 0.02

  private let imageUrls: [URL]
  private let korean: Bool

  private let sceneView = ARSCNView()
  private let artNode = SCNNode() // sits on the surface: x right, y up, z out of the surface
  private let sizeNode = SCNNode() // the picture and its shadow, scaled to the chosen width
  private var surface: simd_float4x4?
  private var quarterTurns = 0
  private var width: Float = 0.6
  private var ready = false

  private let hintLabel = UILabel()
  private let slider = UISlider()
  private let closeButton = UIButton(type: .system)
  private let turnButton = UIButton(type: .system)
  private let shutterButton = UIButton(type: .custom)
  private let previewView = UIImageView()
  private let retakeButton = UIButton(type: .system)
  private let saveButton = UIButton(type: .system)
  private var shot: UIImage?

  init(imageUrls: [URL], korean: Bool) {
    self.imageUrls = imageUrls
    self.korean = korean
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  private func text(_ ko: String, _ en: String) -> String { korean ? ko : en }

  override var prefersStatusBarHidden: Bool { true }
  override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

  // MARK: - Life cycle

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    buildViews()
    artNode.isHidden = true
    artNode.addChildNode(sizeNode)
    sceneView.scene.rootNode.addChildNode(artNode)
    sceneView.session.delegate = self
    sceneView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(moveToTouch(_:))))
    sceneView.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(moveToTouch(_:))))
    setHint(text("작품을 불러오는 중", "Loading the artwork"))
    loadImage(at: 0)
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    guard ARWorldTrackingConfiguration.isSupported else {
      setHint(text("이 기기에서는 AR을 쓸 수 없습니다.", "AR is not available on this device."))
      return
    }
    let config = ARWorldTrackingConfiguration()
    config.planeDetection = [.horizontal, .vertical]
    // LiDAR phones also map slopes and uneven surfaces.
    if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
      config.sceneReconstruction = .mesh
    }
    sceneView.session.run(config)
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sceneView.session.pause()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    // A UISlider is horizontal; turned a quarter it runs bottom (small) to top (large).
    let length = min(320, view.bounds.height * 0.42)
    slider.bounds = CGRect(x: 0, y: 0, width: length, height: 44)
    slider.center = CGPoint(x: view.bounds.width - view.safeAreaInsets.right - 30, y: view.bounds.midY)
    slider.transform = CGAffineTransform(rotationAngle: -.pi / 2)
  }

  // MARK: - Artwork

  private func loadImage(at index: Int) {
    guard index < imageUrls.count else {
      setHint(text("이 작품은 이미지를 불러올 수 없습니다.", "This artwork's image could not be loaded."))
      return
    }
    URLSession.shared.dataTask(with: imageUrls[index]) { [weak self] data, _, _ in
      let image = data.flatMap { UIImage(data: $0) }
      DispatchQueue.main.async {
        guard let self else { return }
        if let image, image.size.width > 0 {
          self.buildArtwork(image)
        } else {
          self.loadImage(at: index + 1)
        }
      }
    }.resume()
  }

  private func buildArtwork(_ image: UIImage) {
    let aspect = image.size.height / image.size.width
    func flat(_ contents: Any) -> SCNMaterial {
      let material = SCNMaterial()
      material.diffuse.contents = contents
      material.lightingModel = .constant // the painting's own colours, not the room's light
      return material
    }
    let box = SCNBox(width: 1, height: aspect, length: Self.depth, chamferRadius: 0)
    let edge = flat(UIColor(white: 0.1, alpha: 1))
    box.materials = [flat(image), edge, edge, edge, edge, edge] // front, right, back, left, top, bottom
    let boxNode = SCNNode(geometry: box)
    boxNode.simdPosition = simd_float3(0, 0, Float(Self.depth / 2)) // its back rests on the surface

    // A soft shadow on the surface behind it, so it reads as hanging there.
    let pad: CGFloat = 0.12
    let shadowSize = CGSize(width: 1 + pad * 2, height: aspect + pad * 2)
    let pixels: CGFloat = 400
    let shadowImage = UIGraphicsImageRenderer(size: CGSize(width: shadowSize.width * pixels, height: shadowSize.height * pixels)).image { ctx in
      let rect = CGRect(x: pad * pixels, y: pad * pixels, width: pixels, height: aspect * pixels)
      ctx.cgContext.setShadow(offset: .zero, blur: pad * pixels * 0.5, color: UIColor(white: 0, alpha: 0.7).cgColor)
      UIColor.black.setFill()
      ctx.cgContext.fill(rect)
    }
    let shadowMaterial = flat(shadowImage)
    shadowMaterial.writesToDepthBuffer = false
    let shadowPlane = SCNPlane(width: shadowSize.width, height: shadowSize.height)
    shadowPlane.materials = [shadowMaterial]
    let shadowNode = SCNNode(geometry: shadowPlane)
    shadowNode.simdPosition = simd_float3(0, -0.02, 0.001)
    shadowNode.renderingOrder = -1

    sizeNode.addChildNode(shadowNode)
    sizeNode.addChildNode(boxNode)
    ready = true
    applyTransform()
    setHint(text("벽이나 바닥을 천천히 비춰 주세요", "Slowly point at a wall or the floor"))
  }

  private func applyTransform() {
    sizeNode.simdScale = simd_float3(width, width, 1)
    guard let surface else { return }
    let turn = simd_float4x4(simd_quatf(angle: Float(quarterTurns) * .pi / 2, axis: simd_float3(0, 0, 1)))
    artNode.simdTransform = surface * turn
    artNode.isHidden = false
  }

  // MARK: - Surface

  private func surfaceHit(at point: CGPoint) -> ARRaycastResult? {
    // A plane ARKit has already mapped is steadier; otherwise its estimate of the surface there.
    for target in [ARRaycastQuery.Target.existingPlaneGeometry, .estimatedPlane] {
      if let query = sceneView.raycastQuery(from: point, allowing: target, alignment: .any),
         let result = sceneView.session.raycast(query).first {
        return result
      }
    }
    return nil
  }

  /// Lays the picture flat on the surface, facing the camera, top toward the sky —
  /// or, on a floor or table, top away from the viewer.
  private func place(on result: ARRaycastResult) {
    guard let camera = sceneView.session.currentFrame?.camera.transform else { return }
    let position = simd_make_float3(result.worldTransform.columns.3)
    var normal = simd_normalize(simd_make_float3(result.worldTransform.columns.1))
    if simd_dot(normal, simd_make_float3(camera.columns.3) - position) < 0 { normal = -normal }

    var reference = simd_float3(0, 1, 0)
    if abs(simd_dot(normal, reference)) > 0.85 {
      reference = -simd_make_float3(camera.columns.2) // where the camera looks
      if simd_length(reference - simd_dot(reference, normal) * normal) < 0.2 {
        reference = -simd_make_float3(camera.columns.0) // looking straight down: the phone's top edge
      }
    }
    let up = simd_normalize(reference - simd_dot(reference, normal) * normal)
    let right = simd_cross(up, normal)
    surface = simd_float4x4(columns: (
      simd_float4(right, 0), simd_float4(up, 0), simd_float4(normal, 0), simd_float4(position, 1)
    ))
    applyTransform()
  }

  func session(_ session: ARSession, didUpdate frame: ARFrame) {
    // The first surface found in the middle of the view takes the picture; after that only touches move it.
    guard ready, surface == nil, shot == nil else { return }
    if let result = surfaceHit(at: CGPoint(x: sceneView.bounds.midX, y: sceneView.bounds.midY)) {
      place(on: result)
      setHint(text("놓을 곳을 누르거나 끌어서 옮기세요", "Touch or drag to move it"))
    }
  }

  func session(_ session: ARSession, didFailWithError error: Error) {
    if (error as? ARError)?.code == .cameraUnauthorized {
      setHint(text("카메라를 열 수 없습니다. 설정에서 COLLY의 카메라 접근을 허용해 주세요.", "Allow camera access for COLLY in Settings."))
    } else {
      setHint(text("AR을 시작하지 못했습니다.", "AR could not start."))
    }
  }

  @objc private func moveToTouch(_ gesture: UIGestureRecognizer) {
    guard ready, let result = surfaceHit(at: gesture.location(in: sceneView)) else { return }
    place(on: result)
  }

  // MARK: - Controls

  @objc private func sliderChanged() {
    // Even steps along the slider are even ratios of width.
    width = Self.minWidth * pow(Self.maxWidth / Self.minWidth, slider.value)
    applyTransform()
  }

  @objc private func turn() {
    quarterTurns = (quarterTurns + 1) % 4
    applyTransform()
  }

  @objc private func close() {
    dismiss(animated: true)
  }

  @objc private func capture() {
    guard surface != nil else { return }
    let image = upright(sceneView.snapshot())
    shot = image
    previewView.image = image
    saveButton.setTitle(text("저장", "Save"), for: .normal)
    saveButton.setTitleColor(.white, for: .normal)
    saveButton.isEnabled = true
    showReview(true)
  }

  /// The screen stays portrait, so a photo taken with the phone on its side is turned to match the room.
  private func upright(_ image: UIImage) -> UIImage {
    guard let camera = sceneView.session.currentFrame?.camera.transform, let cgImage = image.cgImage else { return image }
    let skyTowardTop = -camera.columns.0.y // ARKit's camera axes are landscape: the screen's top is its -x
    let skyTowardRight = camera.columns.1.y
    let orientation: UIImage.Orientation
    if abs(skyTowardRight) > abs(skyTowardTop) {
      orientation = skyTowardRight > 0 ? .left : .right
    } else {
      orientation = skyTowardTop < 0 ? .down : .up
    }
    if orientation == .up { return image }
    let turned = UIImage(cgImage: cgImage, scale: image.scale, orientation: orientation)
    return UIGraphicsImageRenderer(size: turned.size).image { _ in turned.draw(at: .zero) }
  }

  @objc private func retake() {
    shot = nil
    showReview(false)
  }

  @objc private func save() {
    guard let shot else { return }
    saveButton.isEnabled = false
    saveButton.setTitle(text("저장하는 중", "Saving"), for: .normal)
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
      guard status == .authorized || status == .limited else {
        DispatchQueue.main.async { self?.saved(false) }
        return
      }
      PHPhotoLibrary.shared().performChanges({
        PHAssetChangeRequest.creationRequestForAsset(from: shot)
      }, completionHandler: { ok, _ in
        DispatchQueue.main.async { self?.saved(ok) }
      })
    }
  }

  private func saved(_ ok: Bool) {
    saveButton.isEnabled = !ok
    saveButton.setTitle(ok ? text("사진 앱에 저장했습니다", "Saved to Photos") : text("저장하지 못했습니다. 다시 시도", "Could not save. Try again"), for: .normal)
    saveButton.setTitleColor(ok ? UIColor(red: 0.83, green: 0.65, blue: 0.28, alpha: 1) : .white, for: .normal)
  }

  private func showReview(_ reviewing: Bool) {
    previewView.isHidden = !reviewing
    retakeButton.isHidden = !reviewing
    saveButton.isHidden = !reviewing
    for control in [slider, turnButton, shutterButton, hintLabel] as [UIView] { control.isHidden = reviewing }
  }

  private func setHint(_ message: String) {
    hintLabel.text = message
  }

  // MARK: - Views

  private func buildViews() {
    sceneView.frame = view.bounds
    sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(sceneView)

    let coaching = ARCoachingOverlayView() // Apple's own "move the phone" guide until a surface is found
    coaching.session = sceneView.session
    coaching.goal = .anyPlane
    coaching.frame = view.bounds
    coaching.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(coaching)

    previewView.frame = view.bounds
    previewView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    previewView.contentMode = .scaleAspectFit
    previewView.backgroundColor = .black
    view.addSubview(previewView)

    slider.minimumValue = 0
    slider.maximumValue = 1
    slider.value = log(width / Self.minWidth) / log(Self.maxWidth / Self.minWidth)
    slider.minimumTrackTintColor = .white
    slider.maximumTrackTintColor = UIColor(white: 1, alpha: 0.35)
    slider.addTarget(self, action: #selector(sliderChanged), for: .valueChanged)
    view.addSubview(slider)

    hintLabel.textColor = .white
    hintLabel.font = .systemFont(ofSize: 13)
    hintLabel.textAlignment = .center
    hintLabel.numberOfLines = 0
    hintLabel.layer.shadowColor = UIColor.black.cgColor
    hintLabel.layer.shadowOpacity = 0.8
    hintLabel.layer.shadowRadius = 4
    hintLabel.layer.shadowOffset = .zero

    let symbols = UIImage.SymbolConfiguration(pointSize: 22, weight: .regular)
    closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: symbols), for: .normal)
    closeButton.accessibilityLabel = text("닫기", "Close")
    closeButton.addTarget(self, action: #selector(close), for: .touchUpInside)
    turnButton.setImage(UIImage(systemName: "rotate.right", withConfiguration: symbols), for: .normal)
    turnButton.accessibilityLabel = text("90도 돌리기", "Turn 90 degrees")
    turnButton.addTarget(self, action: #selector(turn), for: .touchUpInside)

    shutterButton.backgroundColor = .white
    shutterButton.layer.cornerRadius = 34
    shutterButton.layer.borderWidth = 4
    shutterButton.layer.borderColor = UIColor(white: 1, alpha: 0.45).cgColor
    shutterButton.accessibilityLabel = text("촬영", "Take photo")
    shutterButton.addTarget(self, action: #selector(capture), for: .touchUpInside)

    retakeButton.setTitle(text("다시 찍기", "Retake"), for: .normal)
    retakeButton.addTarget(self, action: #selector(retake), for: .touchUpInside)
    saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)

    for button in [closeButton, turnButton, retakeButton, saveButton] {
      button.tintColor = .white
      button.setTitleColor(.white, for: .normal)
      button.titleLabel?.font = .systemFont(ofSize: 15)
    }
    for item in [hintLabel, closeButton, turnButton, shutterButton, retakeButton, saveButton] as [UIView] {
      item.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(item)
    }

    let safe = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      closeButton.topAnchor.constraint(equalTo: safe.topAnchor, constant: 6),
      closeButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -8),
      closeButton.widthAnchor.constraint(equalToConstant: 44),
      closeButton.heightAnchor.constraint(equalToConstant: 44),

      shutterButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      shutterButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -24),
      shutterButton.widthAnchor.constraint(equalToConstant: 68),
      shutterButton.heightAnchor.constraint(equalToConstant: 68),

      turnButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
      turnButton.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 28),
      turnButton.widthAnchor.constraint(equalToConstant: 44),
      turnButton.heightAnchor.constraint(equalToConstant: 44),

      hintLabel.bottomAnchor.constraint(equalTo: shutterButton.topAnchor, constant: -16),
      hintLabel.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 28),
      hintLabel.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -28),

      retakeButton.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 28),
      retakeButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -28),
      saveButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -28),
      saveButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -28),
    ])
    showReview(false)
  }
}
