package expo.modules.collyar

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.GLUtils
import android.opengl.Matrix
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.text.SpannableString
import android.text.style.RelativeSizeSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.SeekBar
import android.widget.TextView
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Point
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * The artwork hung in the room — the Android twin of ios/CollyArViewController.swift,
 * on ARCore. The surface under a touch (wall, floor, slope) takes the picture and it
 * stays there as the phone moves. Touch or drag to move it, the side slider for its
 * width, the turn button for 90° steps; the shutter keeps the camera view with the
 * picture and saves it to the gallery.
 */
class CollyArActivity : Activity(), GLSurfaceView.Renderer {
  companion object {
    const val EXTRA_IMAGES = "images"
    const val EXTRA_KOREAN = "korean"
    private const val MIN_WIDTH = 0.15f // metres
    private const val MAX_WIDTH = 3.0f
    private const val LIFT = 0.02f // the picture stands this far off the surface, its shadow lies on it
    private const val SHADOW_PAD = 0.12f // of the picture's width
    private const val MAX_TEXTURE = 2048
    private const val REQUEST_CAMERA = 1
    private const val REQUEST_STORAGE = 2
  }

  private var korean = true
  private lateinit var glView: GLSurfaceView
  private lateinit var hintView: TextView
  private lateinit var slider: SeekBar
  private lateinit var turnButton: TextView
  private lateinit var shutterButton: View
  private lateinit var previewView: ImageView
  private lateinit var retakeButton: TextView
  private lateinit var saveButton: TextView
  private var shot: Bitmap? = null
  private var cameraAsked = false
  private var installRequested = false

  @Volatile private var session: Session? = null

  // Set on the main thread, read while drawing.
  @Volatile private var pendingBitmap: Bitmap? = null
  @Volatile private var pendingTouch: FloatArray? = null
  @Volatile private var width = 0.6f
  @Volatile private var quarterTurns = 0
  @Volatile private var captureRequested = false
  @Volatile private var reviewing = false
  @Volatile private var placed = false

  // Drawing thread only.
  private var artBitmap: Bitmap? = null
  private var artReady = false
  private var aspect = 1f
  private var viewWidth = 0
  private var viewHeight = 0
  private var geometryChanged = true
  private var cameraUvReady = false
  private var cameraTexture = 0
  private var artTexture = 0
  private var backgroundProgram = 0
  private var artProgram = 0
  private var surface: FloatArray? = null // on the surface: x right, y up, z out of it
  private var shownAngle = 0f
  private val projection = FloatArray(16)
  private val view = FloatArray(16)
  private val model = FloatArray(16)
  private val modelView = FloatArray(16)
  private val mvp = FloatArray(16)
  private val screenQuad = floats(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)
  private val cameraUv = floats(0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f)
  private val unitQuad = floats(-0.5f, -0.5f, 0.5f, -0.5f, -0.5f, 0.5f, 0.5f, 0.5f)

  private fun text(ko: String, en: String) = if (korean) ko else en

  // ---------------------------------------------------------------- life cycle

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    korean = intent.getBooleanExtra(EXTRA_KOREAN, true)
    buildViews()
    hintView.text = text("작품을 불러오는 중", "Loading the artwork")
    loadImage(intent.getStringArrayListExtra(EXTRA_IMAGES) ?: arrayListOf())
  }

  override fun onResume() {
    super.onResume()
    if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      if (!cameraAsked) {
        cameraAsked = true
        requestPermissions(arrayOf(Manifest.permission.CAMERA), REQUEST_CAMERA)
      } else {
        hintView.text = text("카메라를 열 수 없습니다. 설정에서 COLLY의 카메라 접근을 허용해 주세요.", "Allow camera access for COLLY in Settings.")
      }
      return
    }
    if (session == null) {
      try {
        // Google's ARCore services may need installing or updating first; the call comes back here afterwards.
        if (ArCoreApk.getInstance().requestInstall(this, !installRequested) == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
          installRequested = true
          return
        }
        val created = Session(this)
        val config = Config(created)
        config.setPlaneFindingMode(Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL)
        config.setUpdateMode(Config.UpdateMode.LATEST_CAMERA_IMAGE)
        config.setFocusMode(Config.FocusMode.AUTO)
        // With depth, slopes and uneven surfaces can take the picture too.
        if (created.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
          config.setDepthMode(Config.DepthMode.AUTOMATIC)
        }
        created.configure(config)
        session = created
      } catch (e: Exception) {
        hintView.text = text("이 기기에서는 AR을 쓸 수 없습니다.", "AR is not available on this device.")
        return
      }
    }
    try {
      session?.resume()
    } catch (e: Exception) {
      session = null
      hintView.text = text("카메라를 열 수 없습니다.", "The camera could not be opened.")
      return
    }
    glView.onResume()
  }

  override fun onPause() {
    super.onPause()
    glView.onPause()
    session?.pause()
  }

  override fun onDestroy() {
    super.onDestroy()
    session?.close()
    session = null
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_STORAGE) {
      if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) save() else saved(false)
    }
  }

  // ---------------------------------------------------------------- artwork

  private fun loadImage(addresses: List<String>) {
    Thread {
      var loaded: Bitmap? = null
      for (address in addresses) {
        try {
          val connection = URL(address).openConnection() as HttpURLConnection
          connection.connectTimeout = 15000
          connection.readTimeout = 20000
          connection.inputStream.use { stream -> loaded = BitmapFactory.decodeStream(stream) }
          connection.disconnect()
        } catch (e: Exception) {
          loaded = null
        }
        if (loaded != null) break
      }
      var bitmap = loaded
      if (bitmap != null) {
        val longest = max(bitmap.width, bitmap.height)
        if (longest > MAX_TEXTURE) {
          val scale = MAX_TEXTURE.toFloat() / longest
          bitmap = Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
        }
      }
      val result = bitmap
      runOnUiThread {
        if (result == null) {
          hintView.text = text("이 작품은 이미지를 불러올 수 없습니다.", "This artwork's image could not be loaded.")
        } else {
          pendingBitmap = result
          hintView.text = text("벽이나 바닥을 천천히 비춰 주세요", "Slowly point at a wall or the floor")
        }
      }
    }.start()
  }

  // ---------------------------------------------------------------- drawing

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    val textures = IntArray(2)
    GLES20.glGenTextures(2, textures, 0)
    cameraTexture = textures[0]
    artTexture = textures[1]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTexture)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    backgroundProgram = program(BACKGROUND_VERTEX, BACKGROUND_FRAGMENT)
    artProgram = program(ART_VERTEX, ART_FRAGMENT)
    // A new GL context has lost the picture's texture: load it again.
    artReady = false
    cameraUvReady = false
    if (pendingBitmap == null) pendingBitmap = artBitmap
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    GLES20.glViewport(0, 0, width, height)
    viewWidth = width
    viewHeight = height
    geometryChanged = true
  }

  override fun onDrawFrame(gl: GL10?) {
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
    val current = session ?: return
    uploadPendingBitmap()
    try {
      if (geometryChanged) {
        @Suppress("DEPRECATION")
        current.setDisplayGeometry(windowManager.defaultDisplay.rotation, viewWidth, viewHeight)
        geometryChanged = false
      }
      current.setCameraTextureName(cameraTexture)
      val frame = current.update()
      if (frame.hasDisplayGeometryChanged() || !cameraUvReady) {
        screenQuad.position(0)
        cameraUv.position(0)
        frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, screenQuad, Coordinates2d.TEXTURE_NORMALIZED, cameraUv)
        cameraUvReady = true
      }
      if (frame.timestamp == 0L) return
      drawBackground()

      val camera = frame.camera
      if (camera.trackingState == TrackingState.TRACKING) {
        camera.getProjectionMatrix(projection, 0, 0.05f, 60f)
        camera.getViewMatrix(view, 0)
        moveToTouch(frame, camera.displayOrientedPose)
        drawArtwork()
      }
      if (captureRequested) {
        captureRequested = false
        capture(camera.displayOrientedPose)
      }
    } catch (e: Exception) {
      // A dropped frame (camera busy, session paused mid-draw): the next one draws.
    }
  }

  private fun uploadPendingBitmap() {
    val bitmap = pendingBitmap ?: return
    pendingBitmap = null
    artBitmap = bitmap
    aspect = bitmap.height.toFloat() / bitmap.width.toFloat()
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, artTexture)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
    artReady = true
  }

  private fun drawBackground() {
    GLES20.glDisable(GLES20.GL_DEPTH_TEST)
    GLES20.glDisable(GLES20.GL_BLEND)
    GLES20.glUseProgram(backgroundProgram)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTexture)
    GLES20.glUniform1i(GLES20.glGetUniformLocation(backgroundProgram, "u_Texture"), 0)
    val position = GLES20.glGetAttribLocation(backgroundProgram, "a_Position")
    val uv = GLES20.glGetAttribLocation(backgroundProgram, "a_TexCoord")
    screenQuad.position(0)
    cameraUv.position(0)
    GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 0, screenQuad)
    GLES20.glVertexAttribPointer(uv, 2, GLES20.GL_FLOAT, false, 0, cameraUv)
    GLES20.glEnableVertexAttribArray(position)
    GLES20.glEnableVertexAttribArray(uv)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(position)
    GLES20.glDisableVertexAttribArray(uv)
  }

  private fun drawArtwork() {
    val base = surface ?: return
    if (!artReady) return
    // The quarter turn is eased over a few frames, so it is seen happening.
    val target = quarterTurns * 90f
    shownAngle += (target - shownAngle) * 0.25f
    if (abs(target - shownAngle) < 0.1f) shownAngle = target

    GLES20.glEnable(GLES20.GL_BLEND)
    GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)
    GLES20.glUseProgram(artProgram)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, artTexture)
    GLES20.glUniform1i(GLES20.glGetUniformLocation(artProgram, "u_Texture"), 0)
    GLES20.glUniform2f(GLES20.glGetUniformLocation(artProgram, "u_Size"), 1f, aspect)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(artProgram, "u_Blur"), SHADOW_PAD * 0.8f)
    val position = GLES20.glGetAttribLocation(artProgram, "a_Position")
    unitQuad.position(0)
    GLES20.glVertexAttribPointer(position, 2, GLES20.GL_FLOAT, false, 0, unitQuad)
    GLES20.glEnableVertexAttribArray(position)

    // The shadow on the surface first, then the picture standing just off it.
    drawQuad(base, 0.002f, -0.02f, 1f + SHADOW_PAD * 2, aspect + SHADOW_PAD * 2, true)
    drawQuad(base, LIFT, 0f, 1f, aspect, false)

    GLES20.glDisableVertexAttribArray(position)
    GLES20.glDisable(GLES20.GL_BLEND)
  }

  private fun drawQuad(base: FloatArray, lift: Float, drop: Float, extentX: Float, extentY: Float, shadow: Boolean) {
    val size = width
    System.arraycopy(base, 0, model, 0, 16)
    Matrix.rotateM(model, 0, shownAngle, 0f, 0f, 1f)
    Matrix.translateM(model, 0, 0f, drop * size, lift)
    Matrix.scaleM(model, 0, size, size, 1f)
    Matrix.multiplyMM(modelView, 0, view, 0, model, 0)
    Matrix.multiplyMM(mvp, 0, projection, 0, modelView, 0)
    GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(artProgram, "u_Mvp"), 1, false, mvp, 0)
    GLES20.glUniform2f(GLES20.glGetUniformLocation(artProgram, "u_Extent"), extentX, extentY)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(artProgram, "u_Shadow"), if (shadow) 1f else 0f)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
  }

  // ---------------------------------------------------------------- surface

  private fun surfaceHit(frame: Frame, x: Float, y: Float): HitResult? {
    for (hit in frame.hitTest(x, y)) {
      val trackable = hit.trackable
      val usable = when (trackable) {
        is Plane -> trackable.isPoseInPolygon(hit.hitPose)
        is DepthPoint -> true
        is Point -> trackable.orientationMode == Point.OrientationMode.ESTIMATED_SURFACE_NORMAL
        else -> false
      }
      if (usable) return hit
    }
    return null
  }

  /** The first surface found mid-screen takes the picture; after that only touches move it. */
  private fun moveToTouch(frame: Frame, cameraPose: Pose) {
    val touch = pendingTouch
    pendingTouch = null
    if (!artReady || reviewing) return
    val first = surface == null
    val point = touch ?: (if (first) floatArrayOf(viewWidth / 2f, viewHeight / 2f) else return)
    val hit = surfaceHit(frame, point[0], point[1]) ?: return
    place(hit.hitPose, cameraPose)
    if (first) {
      placed = true
      runOnUiThread {
        hintView.text = text("놓을 곳을 누르거나 끌어서 옮기세요\n왼쪽 아래 버튼으로 90°씩 돌립니다", "Touch or drag to move it\nThe button at lower left turns it 90°")
      }
    }
  }

  /**
   * Lays the picture flat on the surface, facing the camera, top toward the sky —
   * or, on a floor or table, top away from the viewer.
   */
  private fun place(hitPose: Pose, cameraPose: Pose) {
    val position = hitPose.translation
    var normal = normalize(hitPose.yAxis) // ARCore: a hit's +Y stands off the surface
    val toCamera = floatArrayOf(cameraPose.tx() - position[0], cameraPose.ty() - position[1], cameraPose.tz() - position[2])
    if (dot(normal, toCamera) < 0f) normal = floatArrayOf(-normal[0], -normal[1], -normal[2])

    var reference = floatArrayOf(0f, 1f, 0f)
    if (abs(dot(normal, reference)) > 0.85f) {
      val back = cameraPose.zAxis
      reference = floatArrayOf(-back[0], -back[1], -back[2]) // where the camera looks
      if (length(alongSurface(reference, normal)) < 0.2f) reference = cameraPose.yAxis // looking straight down: the screen's top
    }
    val up = normalize(alongSurface(reference, normal))
    val right = cross(up, normal)
    surface = floatArrayOf(
      right[0], right[1], right[2], 0f,
      up[0], up[1], up[2], 0f,
      normal[0], normal[1], normal[2], 0f,
      position[0], position[1], position[2], 1f,
    )
  }

  // ---------------------------------------------------------------- photo

  /** Reads back the frame just drawn (camera and picture, none of the buttons). */
  private fun capture(cameraPose: Pose) {
    val buffer = ByteBuffer.allocateDirect(viewWidth * viewHeight * 4).order(ByteOrder.nativeOrder())
    GLES20.glReadPixels(0, 0, viewWidth, viewHeight, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buffer)
    buffer.position(0)
    val raw = Bitmap.createBitmap(viewWidth, viewHeight, Bitmap.Config.ARGB_8888)
    raw.copyPixelsFromBuffer(buffer)
    // GL rows run bottom-up. And the screen stays portrait, so a photo taken with the
    // phone on its side is turned to match the room: which screen edge the sky is toward.
    val skyTowardTop = cameraPose.yAxis[1]
    val skyTowardRight = cameraPose.xAxis[1]
    val turn = if (abs(skyTowardRight) > abs(skyTowardTop)) {
      if (skyTowardRight > 0f) -90f else 90f
    } else {
      if (skyTowardTop < 0f) 180f else 0f
    }
    val matrix = android.graphics.Matrix()
    matrix.postScale(1f, -1f)
    matrix.postRotate(turn)
    val image = Bitmap.createBitmap(raw, 0, 0, viewWidth, viewHeight, matrix, true)
    runOnUiThread { review(image) }
  }

  private fun review(image: Bitmap) {
    shot = image
    previewView.setImageBitmap(image)
    saveButton.text = text("저장", "Save")
    saveButton.setTextColor(Color.WHITE)
    saveButton.isEnabled = true
    showReview(true)
  }

  private fun save() {
    val image = shot ?: return
    if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), REQUEST_STORAGE)
      return
    }
    saveButton.isEnabled = false
    saveButton.text = text("저장하는 중", "Saving")
    Thread {
      var ok = false
      try {
        val values = ContentValues()
        values.put(MediaStore.Images.Media.DISPLAY_NAME, "colly-ar-" + System.currentTimeMillis() + ".jpg")
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        if (Build.VERSION.SDK_INT >= 29) values.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/COLLY")
        val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        if (uri != null) {
          contentResolver.openOutputStream(uri)?.use { stream -> ok = image.compress(Bitmap.CompressFormat.JPEG, 92, stream) }
        }
      } catch (e: Exception) {
        ok = false
      }
      val done = ok
      runOnUiThread { saved(done) }
    }.start()
  }

  private fun saved(ok: Boolean) {
    saveButton.isEnabled = !ok
    saveButton.text = if (ok) text("갤러리에 저장했습니다", "Saved to your gallery") else text("저장하지 못했습니다. 다시 시도", "Could not save. Try again")
    saveButton.setTextColor(if (ok) Color.rgb(212, 165, 71) else Color.WHITE)
  }

  private fun showReview(on: Boolean) {
    reviewing = on
    val review = if (on) View.VISIBLE else View.GONE
    val live = if (on) View.GONE else View.VISIBLE
    previewView.visibility = review
    retakeButton.visibility = review
    saveButton.visibility = review
    slider.visibility = live
    turnButton.visibility = live
    shutterButton.visibility = live
    hintView.visibility = live
  }

  // ---------------------------------------------------------------- views

  private fun dp(value: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

  private fun label(content: CharSequence, size: Float): TextView {
    val view = TextView(this)
    view.text = content
    view.setTextColor(Color.WHITE)
    view.setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
    view.gravity = Gravity.CENTER
    view.setShadowLayer(8f, 0f, 0f, Color.BLACK) // readable over a bright wall, with no box around it
    view.setPadding(dp(10), dp(10), dp(10), dp(10))
    return view
  }

  private fun layout(view: View, width: Int, height: Int, gravity: Int, left: Int = 0, top: Int = 0, right: Int = 0, bottom: Int = 0): FrameLayout.LayoutParams {
    val params = FrameLayout.LayoutParams(width, height, gravity)
    params.setMargins(dp(left), dp(top), dp(right), dp(bottom))
    view.layoutParams = params
    return params
  }

  private fun buildViews() {
    val wrap = FrameLayout.LayoutParams.WRAP_CONTENT
    val fill = FrameLayout.LayoutParams.MATCH_PARENT
    val root = FrameLayout(this)
    root.setBackgroundColor(Color.BLACK)

    glView = GLSurfaceView(this)
    glView.preserveEGLContextOnPause = true
    glView.setEGLContextClientVersion(2)
    glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0)
    glView.setRenderer(this)
    glView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    glView.setOnTouchListener { _, event ->
      if (!reviewing && (event.actionMasked == MotionEvent.ACTION_DOWN || event.actionMasked == MotionEvent.ACTION_MOVE)) {
        pendingTouch = floatArrayOf(event.x, event.y)
      }
      true
    }
    root.addView(glView, FrameLayout.LayoutParams(fill, fill))

    previewView = ImageView(this)
    previewView.scaleType = ImageView.ScaleType.FIT_CENTER
    previewView.setBackgroundColor(Color.BLACK)
    root.addView(previewView, FrameLayout.LayoutParams(fill, fill))

    // A SeekBar is horizontal; turned a quarter it runs bottom (small) to top (large).
    slider = SeekBar(this)
    slider.max = 1000
    slider.progress = (ln(width / MIN_WIDTH) / ln(MAX_WIDTH / MIN_WIDTH) * 1000f).toInt()
    slider.rotation = 270f
    slider.translationX = dp(108).toFloat() // its 280dp box is centred 140dp in from the edge: bring the bar to 32dp
    slider.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
      override fun onProgressChanged(seekBar: SeekBar?, progress: Int, fromUser: Boolean) {
        // Even steps along the slider are even ratios of width.
        width = MIN_WIDTH * (MAX_WIDTH / MIN_WIDTH).pow(progress / 1000f)
      }
      override fun onStartTrackingTouch(seekBar: SeekBar?) {}
      override fun onStopTrackingTouch(seekBar: SeekBar?) {}
    })
    layout(slider, dp(280), dp(44), Gravity.END or Gravity.CENTER_VERTICAL)
    root.addView(slider)

    hintView = label("", 13f)
    layout(hintView, fill, wrap, Gravity.BOTTOM, left = 28, right = 28, bottom = 124)
    root.addView(hintView)

    val close = label("✕", 22f)
    close.contentDescription = text("닫기", "Close")
    close.setOnClickListener { finish() }
    layout(close, wrap, wrap, Gravity.TOP or Gravity.END, top = 30, right = 8)
    root.addView(close)

    // The one control a first-time user would not guess, so it carries its name under the icon.
    val turnText = SpannableString("↻\n" + text("90° 회전", "Turn 90°"))
    turnText.setSpan(RelativeSizeSpan(2.4f), 0, 1, 0)
    turnButton = label(turnText, 13f)
    turnButton.setTypeface(turnButton.typeface, Typeface.BOLD)
    turnButton.setOnClickListener { quarterTurns += 1 }
    layout(turnButton, wrap, wrap, Gravity.BOTTOM or Gravity.START, left = 12, bottom = 30)
    root.addView(turnButton)

    shutterButton = View(this)
    val disc = GradientDrawable()
    disc.shape = GradientDrawable.OVAL
    disc.setColor(Color.WHITE)
    disc.setStroke(dp(4), Color.argb(115, 255, 255, 255))
    shutterButton.background = disc
    shutterButton.contentDescription = text("촬영", "Take photo")
    shutterButton.setOnClickListener { if (placed) captureRequested = true }
    layout(shutterButton, dp(68), dp(68), Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL, bottom = 40)
    root.addView(shutterButton)

    retakeButton = label(text("다시 찍기", "Retake"), 15f)
    retakeButton.setOnClickListener {
      shot = null
      showReview(false)
    }
    layout(retakeButton, wrap, wrap, Gravity.BOTTOM or Gravity.START, left = 18, bottom = 36)
    root.addView(retakeButton)

    saveButton = label(text("저장", "Save"), 15f)
    saveButton.setOnClickListener { save() }
    layout(saveButton, wrap, wrap, Gravity.BOTTOM or Gravity.END, right = 18, bottom = 36)
    root.addView(saveButton)

    setContentView(root)
    showReview(false)
  }

  // ---------------------------------------------------------------- GL and vector helpers

  private fun program(vertex: String, fragment: String): Int {
    val id = GLES20.glCreateProgram()
    GLES20.glAttachShader(id, shader(GLES20.GL_VERTEX_SHADER, vertex))
    GLES20.glAttachShader(id, shader(GLES20.GL_FRAGMENT_SHADER, fragment))
    GLES20.glLinkProgram(id)
    return id
  }

  private fun shader(type: Int, source: String): Int {
    val id = GLES20.glCreateShader(type)
    GLES20.glShaderSource(id, source)
    GLES20.glCompileShader(id)
    return id
  }

  private fun floats(vararg values: Float): FloatBuffer {
    val buffer = ByteBuffer.allocateDirect(values.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
    buffer.put(values)
    buffer.position(0)
    return buffer
  }

  private fun dot(a: FloatArray, b: FloatArray) = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  private fun length(a: FloatArray) = sqrt(dot(a, a))
  private fun normalize(a: FloatArray): FloatArray {
    val l = max(length(a), 1e-6f)
    return floatArrayOf(a[0] / l, a[1] / l, a[2] / l)
  }
  private fun cross(a: FloatArray, b: FloatArray) = floatArrayOf(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
  /** The part of `a` that lies in the surface whose normal is `n`. */
  private fun alongSurface(a: FloatArray, n: FloatArray): FloatArray {
    val d = dot(a, n)
    return floatArrayOf(a[0] - d * n[0], a[1] - d * n[1], a[2] - d * n[2])
  }
}

private const val BACKGROUND_VERTEX = """
attribute vec4 a_Position;
attribute vec2 a_TexCoord;
varying vec2 v_TexCoord;
void main() {
  gl_Position = a_Position;
  v_TexCoord = a_TexCoord;
}
"""

private const val BACKGROUND_FRAGMENT = """#extension GL_OES_EGL_image_external : require
precision mediump float;
varying vec2 v_TexCoord;
uniform samplerExternalOES u_Texture;
void main() {
  gl_FragColor = texture2D(u_Texture, v_TexCoord);
}
"""

private const val ART_VERTEX = """
uniform mat4 u_Mvp;
uniform vec2 u_Extent;
attribute vec2 a_Position;
varying vec2 v_Local;
void main() {
  v_Local = a_Position * u_Extent;
  gl_Position = u_Mvp * vec4(v_Local, 0.0, 1.0);
}
"""

// One quad, two uses: the picture (its texture), or its shadow (dark, fading with distance from the picture's edge).
private const val ART_FRAGMENT = """
precision mediump float;
uniform sampler2D u_Texture;
uniform vec2 u_Size;
uniform float u_Blur;
uniform float u_Shadow;
varying vec2 v_Local;
void main() {
  if (u_Shadow > 0.5) {
    vec2 outside = max(abs(v_Local) - u_Size * 0.5, 0.0);
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.55 * (1.0 - smoothstep(0.0, u_Blur, length(outside))));
  } else {
    gl_FragColor = texture2D(u_Texture, vec2(v_Local.x / u_Size.x + 0.5, 0.5 - v_Local.y / u_Size.y));
  }
}
"""
