package de.tutao.tutanota.push

import android.util.Log
import de.tutao.tutanota.*
import de.tutao.tutanota.data.SseInfo
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.MalformedURLException
import java.net.URL
import java.net.URLEncoder
import java.util.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.abs

class SseClient internal constructor(private val crypto: Crypto,
									 private val sseStorage: SseStorage,
									 private val networkObserver: NetworkObserver,
									 private val sseListener: SseListener) {
	@Volatile
	private var connectedSseInfo: SseInfo? = null

	@Volatile
	private var timeoutInSeconds: Long = 90
	private var failedConnectionAttempts = 0
	private val httpsURLConnectionRef = AtomicReference<HttpURLConnection?>(null)
	private val looperThread = LooperThread { connect() }
	private fun reschedule(delayInSeconds: Int) {
		if (looperThread.handler != null) {
			looperThread.handler!!.postDelayed({ connect() }, TimeUnit.SECONDS.toMillis(delayInSeconds.toLong()))
		} else {
			Log.d(TAG, "looper thread is starting, skip additional reschedule")
		}
	}

	fun restartConnectionIfNeeded(sseInfo: SseInfo) {
		val oldConnectedInfo = connectedSseInfo
		connectedSseInfo = sseInfo
		val connection = httpsURLConnectionRef.get()
		if (connection == null) {
			Log.d(TAG, "ConnectionRef not available, schedule connect")
			reschedule(0)
		} else if (oldConnectedInfo == null || oldConnectedInfo.pushIdentifier != sseInfo.pushIdentifier
				|| oldConnectedInfo.sseOrigin != sseInfo.sseOrigin) {
			// If pushIdentifier or SSE origin have changed for some reason, restart the connect.
			// If user IDs have changed, do not restart, if current user is invalid we have either oldConnectedInfo
			Log.d(TAG, "ConnectionRef available, but SseInfo has changed, call disconnect to reschedule connection")
			connection.disconnect()
		} else {
			Log.d(TAG, "ConnectionRef available, do nothing")
		}
	}

	private fun connect() {
		Log.d(TAG, "Starting SSE connection")
		val random = Random()
		var reader: BufferedReader? = null
		if (connectedSseInfo == null) {
			Log.d(TAG, "sse info not available skip reconnect")
			return
		}
		if (!sseListener.onStartingConnection()) {
			return
		}
		timeoutInSeconds = sseStorage.connectTimeoutInSeconds
		if (timeoutInSeconds == 0L) {
			timeoutInSeconds = 90
		}
		val connectionData = prepareSSEConnection(connectedSseInfo!!)
		try {
			val httpURLConnection = openSseConnection(connectionData)
			reader = BufferedReader(InputStreamReader(BufferedInputStream(httpURLConnection.inputStream)))
			var event: String
			Log.d(TAG, "SSE connection established, listening for events")
			var notifiedEstablishedConnection = true
			while (reader.readLine().also { event = it } != null) {
				handleLine(event)
				if (notifiedEstablishedConnection) {
					sseListener.onConnectionEstablished()
					notifiedEstablishedConnection = false
				}
			}
		} catch (exception: Exception) {
			handleException(random, exception, connectionData.userId)
		} finally {
			if (reader != null) {
				try {
					reader.close()
				} catch (ignored: IOException) {
				}
			}
			httpsURLConnectionRef.set(null)
		}
	}

	private fun handleException(random: Random, exception: Exception, userId: String) {
		val httpURLConnection = httpsURLConnectionRef.get()
		try {
			// we get not authorized for the stored identifier and user ids, so remove them
			if (httpURLConnection != null && httpURLConnection.responseCode == 403) {
				Log.e(TAG, "not authorized to connect, disable reconnect for $userId")
				sseListener.onNotAuthorized(userId)
				return
			}
		} catch (e: IOException) {
			// ignore Exception when getting status code.
		}
		val delayBoundary = (timeoutInSeconds * 1.5).toInt()
		val delay = (random.nextInt(abs(timeoutInSeconds).toInt()) + delayBoundary) / 2
		failedConnectionAttempts++
		when {
			failedConnectionAttempts > RECONNECTION_ATTEMPTS -> {
				failedConnectionAttempts = 0
				Log.e(TAG, "Too many failed connection attempts, will try to sync notifications next time system wakes app up")
				sseListener.onStoppingReconnectionAttempts()
			}
			networkObserver.hasNetworkConnection() -> {
				Log.e(TAG, "error opening sse, rescheduling after $delay, failedConnectionAttempts: $failedConnectionAttempts", exception)
				reschedule(delay)
			}
			else -> {
				Log.e(TAG, "network is not connected, do not reschedule ", exception)
				sseListener.onStoppingReconnectionAttempts()
			}
		}
	}

	private fun handleLine(line: String) {
		failedConnectionAttempts = 0
		if (!line.startsWith("data: ")) {
			Log.d(TAG, "heartbeat")
			return
		}
		val data = line.substring(6)
		if (data.matches(Regex("^[0-9]+$"))) return
		if (data.startsWith("heartbeatTimeout:")) {
			timeoutInSeconds = data.split(":".toRegex()).toTypedArray()[1].toInt().toLong()
			sseStorage.connectTimeoutInSeconds = timeoutInSeconds
			sseListener.onConnectionEstablished()
			return
		}
		sseListener.onMessage(data, connectedSseInfo)
		Log.d(TAG, "Executing jobFinished after receiving notifications")
	}

	private fun requestJson(pushIdentifier: String, userId: String?): String {
		val jsonObject = JSONObject()
		return try {
			jsonObject.put("_format", "0")
			jsonObject.put("identifier", pushIdentifier)
			val jsonArray = JSONArray()
			val userIdObject = JSONObject()
			userIdObject.put("_id", generateId())
			userIdObject.put("value", userId)
			jsonArray.put(userIdObject)
			jsonObject.put("userIds", jsonArray)
			URLEncoder.encode(jsonObject.toString(), "UTF-8")
		} catch (e: JSONException) {
			throw RuntimeException(e)
		} catch (e: UnsupportedEncodingException) {
			throw RuntimeException(e)
		}
	}

	private fun generateId(): String {
		val bytes = ByteArray(4)
		crypto.randomizer.nextBytes(bytes)
		return Utils.base64ToBase64Url(Utils.bytesToBase64(bytes))
	}

	private fun prepareSSEConnection(connectedSseInfo: SseInfo): ConnectionData {
		check(!connectedSseInfo.userIds.isEmpty()) { "Push identifier but no user IDs" }
		val userId = connectedSseInfo.userIds.iterator().next()
		val json = requestJson(connectedSseInfo.pushIdentifier, userId)
		val url: URL = try {
			URL(connectedSseInfo.sseOrigin + "/sse?_body=" + json)
		} catch (e: MalformedURLException) {
			throw RuntimeException(e)
		}
		return ConnectionData(userId, url)
	}

	@Throws(IOException::class)
	private fun openSseConnection(connectionData: ConnectionData): HttpURLConnection {
		val httpsURLConnection = connectionData.url.openConnection() as HttpURLConnection
		httpsURLConnectionRef.set(httpsURLConnection)
		httpsURLConnection.requestMethod = "GET"
		httpsURLConnection.setRequestProperty("Content-Type", "application/json")
		httpsURLConnection.setRequestProperty("Connection", "Keep-Alive")
		httpsURLConnection.setRequestProperty("Keep-Alive", "header")
		httpsURLConnection.setRequestProperty("Connection", "close")
		httpsURLConnection.setRequestProperty("Accept", "text/event-stream")
		addCommonHeaders(httpsURLConnection)
		httpsURLConnection.connectTimeout = TimeUnit.SECONDS.toMillis(5).toInt()
		httpsURLConnection.readTimeout = (TimeUnit.SECONDS.toMillis(timeoutInSeconds) * 1.2).toInt()
		return httpsURLConnection
	}

	fun stopConnection() {
		val connection = httpsURLConnectionRef.get()
		Log.d(TAG, "Disconnect sse client")
		if (connection != null) {
			connection.disconnect()
			// check in connect() prevents rescheduling new connection attempts
			connectedSseInfo = null
		}
	}

	interface SseListener {
		/**
		 * @return `true` to continue connecting
		 */
		fun onStartingConnection(): Boolean

		/**
		 * Will block reading from SSE until this returns
		 */
		fun onMessage(data: String, sseInfo: SseInfo?)
		fun onConnectionEstablished()
		fun onNotAuthorized(userId: String)
		fun onStoppingReconnectionAttempts()
	}

	private class ConnectionData constructor(val userId: String, val url: URL)
	companion object {
		private const val TAG = "SSE"
		const val RECONNECTION_ATTEMPTS = 3
	}

	init {
		looperThread.start()
		networkObserver.setNetworkConnectivityListener { connected ->
			val connection = httpsURLConnectionRef.get()
			if (connected && connection == null) {
				Log.d(TAG, "ConnectionRef not available, schedule connect because of network state change")
				reschedule(0)
			}
		}
	}
}