
import androidx.room.ColumnInfo


class ListWrapper {
	@ColumnInfo(name = "temp_values")
	var tempValues: List<String>? = null
}