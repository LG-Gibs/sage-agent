package com.iterativ.sage.capability

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Android implementation of the SAGE Capability Manifest probe.
 *
 * Platform paradigm (Android): GPU acceleration via Vulkan, hardware ML via
 * NNAPI. Pairs with the iOS (Metal / Core ML) module.
 */
class SageCapabilityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SageCapability")

    Function("getPlatform") { "android" }

    Function("getOsVersion") { Build.VERSION.RELEASE ?: "unknown" }

    Function("getTotalRamBytes") {
      val ctx = appContext.reactContext ?: return@Function 0.0
      val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val info = ActivityManager.MemoryInfo()
      am.getMemoryInfo(info)
      info.totalMem.toDouble()
    }

    Function("getGpuBackend") {
      // llama.cpp uses the Vulkan backend on Android; Vulkan 1.1 is broadly
      // available on the API 26+ devices SAGE targets.
      "vulkan"
    }

    Function("getMlAccelerator") {
      // NNAPI is available from API 27 (Android 8.1).
      if (Build.VERSION.SDK_INT >= 27) "nnapi" else "none"
    }

    Function("hasNpu") {
      // Heuristic: SoCs on API 29+ broadly expose an NPU/DSP through NNAPI.
      Build.VERSION.SDK_INT >= 29
    }

    Function("getThermalState") {
      val ctx = appContext.reactContext
      if (ctx != null && Build.VERSION.SDK_INT >= 29) {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        when (pm.currentThermalStatus) {
          PowerManager.THERMAL_STATUS_SEVERE,
          PowerManager.THERMAL_STATUS_CRITICAL,
          PowerManager.THERMAL_STATUS_EMERGENCY,
          PowerManager.THERMAL_STATUS_SHUTDOWN -> "critical"
          PowerManager.THERMAL_STATUS_MODERATE -> "serious"
          PowerManager.THERMAL_STATUS_LIGHT -> "fair"
          else -> "nominal"
        }
      } else {
        "nominal"
      }
    }

    AsyncFunction("listInstalledModels") {
      val ctx = appContext.reactContext
        ?: return@AsyncFunction emptyList<Map<String, Any>>()
      val dir = File(ctx.filesDir, "models")
      val candidates = listOf(
        "gemma-4-2b-q4.gguf" to "gemma-4-2b",
        "gemma-4-9b-q4.gguf" to "gemma-4-9b",
      )
      val out = mutableListOf<Map<String, Any>>()
      for ((fileName, id) in candidates) {
        val f = File(dir, fileName)
        if (f.exists()) {
          out.add(
            mapOf(
              "id" to id,
              "path" to f.absolutePath,
              "sizeBytes" to f.length().toDouble(),
              "verified" to verifyGguf(f),
            ),
          )
        }
      }
      out
    }
  }

  /** A real GGUF file begins with the ASCII magic "GGUF" (0x47 0x47 0x55 0x46). */
  private fun verifyGguf(f: File): Boolean {
    return try {
      f.inputStream().use { input ->
        val magic = ByteArray(4)
        if (input.read(magic) != 4) return@use false
        magic[0] == 0x47.toByte() &&
          magic[1] == 0x47.toByte() &&
          magic[2] == 0x55.toByte() &&
          magic[3] == 0x46.toByte()
      }
    } catch (e: Exception) {
      false
    }
  }
}
