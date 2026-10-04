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
            + "AND resource_type = #{resourceType} AND resource_id = #{resourceId}")
    NotificationSetting find(@Param("userId") long userId, @Param("resourceType") String resourceType,
                             @Param("resourceId") long resourceId);

    @Select("SELECT " + COLUMNS + " FROM notification_setting WHERE user_id = #{userId} "
            + "AND resource_type = #{resourceType} AND resource_id = #{resourceId} FOR UPDATE")
    NotificationSetting lock(@Param("userId") long userId, @Param("resourceType") String resourceType,
                             @Param("resourceId") long resourceId);

    @Insert("""
            INSERT INTO notification_setting
              (user_id, resource_type, resource_id, connection_id, follow_up_mode)
            VALUES (#{userId}, #{resourceType}, #{resourceId}, #{connectionId}, #{followUpMode})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(NotificationSetting setting);

    @Update("""
            UPDATE notification_setting SET follow_up_mode = #{mode}, version = version + 1,
              updated_at = UTC_TIMESTAMP(6)
            WHERE user_id = #{userId} AND resource_type = #{resourceType}
              AND resource_id = #{resourceId} AND connection_id = #{connectionId}
              AND version = #{version}
            """)
    int update(@Param("userId") long userId, @Param("resourceType") String resourceType,
                   @Param("resourceId") long resourceId,
                   @Param("connectionId") long connectionId, @Param("version") long version,
                   @Param("mode") String mode);

    @Delete("DELETE FROM notification_setting WHERE resource_type = #{resourceType} "
            + "AND resource_id = #{resourceId}")
    int delete(@Param("resourceType") String resourceType,
               @Param("resourceId") long resourceId);
}
