package com.jacolp.mapper;

import com.jacolp.entity.NotificationSetting;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface NotificationSettingMapper {
    String COLUMNS = "id, user_id, resource_type, resource_id, connection_id, follow_up_mode, version";

    @Select("SELECT " + COLUMNS + " FROM notification_setting WHERE user_id = #{userId} "
            + "AND resource_type = 'MEMORY_CARD' AND resource_id = #{cardId}")
    NotificationSetting card(@Param("userId") long userId, @Param("cardId") long cardId);

    @Select("SELECT " + COLUMNS + " FROM notification_setting WHERE user_id = #{userId} "
            + "AND resource_type = 'MEMORY_CARD' AND resource_id = #{cardId} FOR UPDATE")
    NotificationSetting lockCard(@Param("userId") long userId, @Param("cardId") long cardId);

    @Insert("""
            INSERT INTO notification_setting
              (user_id, resource_type, resource_id, connection_id, follow_up_mode)
            VALUES (#{userId}, 'MEMORY_CARD', #{resourceId}, #{connectionId}, #{followUpMode})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertCard(NotificationSetting setting);

    @Update("""
            UPDATE notification_setting SET follow_up_mode = #{mode}, version = version + 1,
              updated_at = UTC_TIMESTAMP(6)
            WHERE user_id = #{userId} AND resource_type = 'MEMORY_CARD'
              AND resource_id = #{cardId} AND connection_id = #{connectionId}
              AND version = #{version}
            """)
    int updateCard(@Param("userId") long userId, @Param("cardId") long cardId,
                   @Param("connectionId") long connectionId, @Param("version") long version,
                   @Param("mode") String mode);

    @Delete("DELETE FROM notification_setting WHERE resource_type = 'MEMORY_CARD' "
            + "AND resource_id = #{cardId}")
    int deleteCard(@Param("cardId") long cardId);
}
