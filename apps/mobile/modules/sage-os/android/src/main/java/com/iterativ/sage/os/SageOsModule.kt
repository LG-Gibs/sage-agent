package com.iterativ.sage.os

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.provider.CalendarContract
import android.provider.ContactsContract
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Android native OS bridge (Contacts / Calendar / Reminders / sandboxed Files).
 * Permission denial throws "permission_denied: <scope>", which the JS layer maps
 * to a PERMISSION_DENIED ToolResult. Reminders are persisted to app-private
 * storage (offline); an AlarmManager alarm can be scheduled alongside.
 */
class SageOsModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw Exception("no_context")

  override fun definition() = ModuleDefinition {
    Name("SageOs")

    AsyncFunction("contactsRead") { query: String?, limit: Int ->
      requirePermission(Manifest.permission.READ_CONTACTS, "contacts")
      val out = mutableListOf<Map<String, Any>>()
      val cursor = ctx.contentResolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER,
        ),
        null, null, null,
      )
      cursor?.use {
        val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val numIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
        while (it.moveToNext() && out.size < limit) {
          val name = it.getString(nameIdx) ?: continue
          if (!query.isNullOrEmpty() && !name.lowercase().contains(query.lowercase())) continue
          out.add(mapOf("name" to name, "phones" to listOf(it.getString(numIdx) ?: ""), "emails" to emptyList<String>()))
        }
      }
      out
    }

    AsyncFunction("calendarCreate") { title: String, startISO: String, endISO: String, location: String?, notes: String? ->
      requirePermission(Manifest.permission.WRITE_CALENDAR, "calendar")
      val calId = defaultCalendarId() ?: throw Exception("no_calendar")
      val values = ContentValues().apply {
        put(CalendarContract.Events.CALENDAR_ID, calId)
        put(CalendarContract.Events.TITLE, title)
        put(CalendarContract.Events.DTSTART, parseISO(startISO))
        put(CalendarContract.Events.DTEND, parseISO(endISO))
        put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
        location?.let { put(CalendarContract.Events.EVENT_LOCATION, it) }
        notes?.let { put(CalendarContract.Events.DESCRIPTION, it) }
      }
      val uri = ctx.contentResolver.insert(CalendarContract.Events.CONTENT_URI, values)
      mapOf("id" to (uri?.lastPathSegment ?: ""))
    }

    AsyncFunction("calendarQuery") { startISO: String, endISO: String ->
      requirePermission(Manifest.permission.READ_CALENDAR, "calendar")
      val out = mutableListOf<Map<String, String>>()
      val cursor = ctx.contentResolver.query(
        CalendarContract.Events.CONTENT_URI,
        arrayOf(CalendarContract.Events._ID, CalendarContract.Events.TITLE, CalendarContract.Events.DTSTART, CalendarContract.Events.DTEND),
        "${CalendarContract.Events.DTSTART} >= ? AND ${CalendarContract.Events.DTEND} <= ?",
        arrayOf(parseISO(startISO).toString(), parseISO(endISO).toString()),
        "${CalendarContract.Events.DTSTART} ASC",
      )
      cursor?.use {
        while (it.moveToNext()) {
          out.add(mapOf(
            "id" to it.getLong(0).toString(),
            "title" to (it.getString(1) ?: ""),
            "startISO" to formatISO(it.getLong(2)),
            "endISO" to formatISO(it.getLong(3)),
          ))
        }
      }
      out
    }

    AsyncFunction("reminderCreate") { title: String, dueISO: String?, notes: String? ->
      val arr = readReminders()
      val id = "rem_${System.currentTimeMillis()}"
      arr.put(JSONObject(mapOf("id" to id, "title" to title, "completed" to false, "dueISO" to (dueISO ?: JSONObject.NULL), "notes" to (notes ?: ""))))
      writeReminders(arr)
      // An AlarmManager alarm can be scheduled here from dueISO for notification.
      mapOf("id" to id)
    }

    AsyncFunction("reminderList") { includeCompleted: Boolean, limit: Int ->
      val arr = readReminders()
      val out = mutableListOf<Map<String, Any?>>()
      for (i in 0 until arr.length()) {
        if (out.size >= limit) break
        val o = arr.getJSONObject(i)
        if (!includeCompleted && o.optBoolean("completed")) continue
        out.add(mapOf(
          "id" to o.getString("id"),
          "title" to o.getString("title"),
          "completed" to o.optBoolean("completed"),
          "dueISO" to (if (o.isNull("dueISO")) null else o.getString("dueISO")),
        ))
      }
      out
    }

    AsyncFunction("fileRead") { path: String ->
      mapOf("content" to sandboxFile(path).readText())
    }

    AsyncFunction("fileWrite") { path: String, content: String ->
      val f = sandboxFile(path)
      f.parentFile?.mkdirs()
      f.writeText(content)
      mapOf("bytes" to content.toByteArray().size)
    }

    AsyncFunction("fileList") { path: String ->
      val dir = sandboxFile(path)
      (dir.listFiles() ?: emptyArray()).map {
        mapOf("name" to it.name, "isDir" to it.isDirectory, "size" to it.length().toInt())
      }
    }
  }

  // MARK: helpers

  private fun requirePermission(permission: String, scope: String) {
    if (ContextCompat.checkSelfPermission(ctx, permission) != PackageManager.PERMISSION_GRANTED) {
      throw Exception("permission_denied: $scope")
    }
  }

  private fun defaultCalendarId(): Long? {
    val cursor = ctx.contentResolver.query(
      CalendarContract.Calendars.CONTENT_URI, arrayOf(CalendarContract.Calendars._ID),
      "${CalendarContract.Calendars.IS_PRIMARY}=1", null, null,
    )
    cursor?.use { if (it.moveToFirst()) return it.getLong(0) }
    return null
  }

  private fun remindersFile(): File = File(ctx.filesDir, "reminders.json")
  private fun readReminders(): JSONArray =
    remindersFile().let { if (it.exists()) JSONArray(it.readText()) else JSONArray() }
  private fun writeReminders(arr: JSONArray) = remindersFile().writeText(arr.toString())

  /** Resolve a relative path inside app-private storage (sandboxed). */
  private fun sandboxFile(path: String): File = File(ctx.filesDir, path.replace("..", ""))

  private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
    timeZone = TimeZone.getTimeZone("UTC")
  }
  private fun parseISO(s: String): Long = iso.parse(s)?.time ?: throw Exception("invalid_date: $s")
  private fun formatISO(ms: Long): String = iso.format(java.util.Date(ms))
}
