package de.tutao.tutanota.alarms

import androidx.room.TypeConverter
import androidx.room.TypeConverters
import de.tutao.tutanota.AndroidNativeCryptoFacade
import de.tutao.tutanota.decryptDate
import de.tutao.tutanota.decryptNumber
import de.tutao.tutanota.decryptString
import kotlinx.serialization.Serializable
import java.util.*
import de.tutao.tutanota.alarms.EncryptedRepeatRule.ExcludedListConverter

@Serializable
@TypeConverters(ExcludedListConverter::class)
class EncryptedRepeatRule(
		val frequency: String,
		val interval: String,
		val timeZone: String,
		val endType: String,
		val endValue: String?,
		val excludedDates: List<String>,
) {
	internal class ExcludedListConverter {
		@TypeConverter
		fun listToString(excludedDatesList: List<String>) = excludedDatesList.joinToString(",")
		@TypeConverter
		fun stringToList(string: String) = string.split(",")
	}
}

fun EncryptedRepeatRule.decrypt(crypto: AndroidNativeCryptoFacade, sessionKey: ByteArray): RepeatRule {
	val repeatPeriodNumber = crypto.decryptNumber(frequency, sessionKey)
	val repeatPeriod = RepeatPeriod[repeatPeriodNumber]

	val endTypeNumber = crypto.decryptNumber(endType, sessionKey)
	val endType = EndType[endTypeNumber]
	return RepeatRule(
			frequency = repeatPeriod,
			interval = crypto.decryptNumber(interval, sessionKey).toInt(),
			timeZone = TimeZone.getTimeZone(crypto.decryptString(timeZone, sessionKey)),
			endValue = if (endValue != null) crypto.decryptNumber(endValue, sessionKey) else null,
			endType = endType,
			excludedDates = excludedDates.map { crypto.decryptDate(it, sessionKey) },
	)
}