package com.jacolp.mapper;

import com.jacolp.entity.Commitment;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface CommitmentMapper {
    String COLUMNS = """
            id, owner_id, shared_connection_id, title, body, due_kind, due_at, due_date,
            due_timezone, next_action, status, result, source_type, source_id,
            created_at, updated_at, version
            """;

    @Insert("""
            INSERT INTO commitment
              (owner_id, title, body, due_kind, due_at, due_date, due_timezone,
               next_action, source_type, source_id)
            VALUES
              (#{ownerId}, #{title}, #{body}, #{dueKind}, #{dueAt}, #{dueDate},
               #{dueTimezone}, #{nextAction}, #{sourceType}, #{sourceId})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Commitment commitment);

    @Select("SELECT " + COLUMNS + " FROM commitment WHERE id = #{id} AND owner_id = #{ownerId} "
            + "AND shared_connection_id IS NULL")
    Commitment findOwned(@Param("id") long id, @Param("ownerId") long ownerId);

    @Select("SELECT " + COLUMNS + " FROM commitment WHERE owner_id = #{ownerId} "
            + "AND shared_connection_id IS NULL")
    List<Commitment> listOwned(@Param("ownerId") long ownerId);

    @Select("SELECT " + COLUMNS + " FROM commitment WHERE id = #{id} AND owner_id = #{ownerId} "
            + "AND shared_connection_id IS NULL FOR UPDATE")
    Commitment lockOwned(@Param("id") long id, @Param("ownerId") long ownerId);

    @Update("""
            UPDATE commitment SET title = #{title}, body = #{body}, due_kind = #{dueKind},
                due_at = #{dueAt}, due_date = #{dueDate}, due_timezone = #{dueTimezone},
                next_action = #{nextAction}, source_type = #{sourceType}, source_id = #{sourceId},
                updated_at = UTC_TIMESTAMP(6), version = version + 1
            WHERE id = #{id} AND owner_id = #{ownerId} AND shared_connection_id IS NULL
              AND version = #{version}
            """)
    int updateOwned(Commitment commitment);

    @Update("""
            UPDATE commitment SET status = #{status}, result = #{result},
                updated_at = UTC_TIMESTAMP(6), version = version + 1
            WHERE id = #{id} AND owner_id = #{ownerId} AND shared_connection_id IS NULL
              AND status = #{oldStatus} AND version = #{version}
            """)
    int changeStatus(@Param("id") long id, @Param("ownerId") long ownerId,
                     @Param("oldStatus") String oldStatus, @Param("status") String status,
                     @Param("result") String result, @Param("version") long version);

    @Delete("""
            DELETE FROM commitment
            WHERE id = #{id} AND owner_id = #{ownerId} AND shared_connection_id IS NULL
              AND version = #{version}
            """)
    int deleteOwned(@Param("id") long id, @Param("ownerId") long ownerId,
                    @Param("version") long version);

    @Select("""
            SELECT id FROM reminder
            WHERE recipient_id = #{ownerId} AND resource_type = 'COMMITMENT'
              AND resource_id = #{id} FOR UPDATE
            """)
    Long lockReminder(@Param("ownerId") long ownerId, @Param("id") long id);

    @Update("""
            UPDATE reminder SET status = 'CANCELLED', revision = revision + 1,
                version = version + 1, updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{reminderId} AND status = 'PENDING'
            """)
    int cancelPendingReminder(@Param("reminderId") long reminderId);

    @Update("""
            UPDATE notification_delivery SET status = 'CANCELLED', lock_token = NULL,
                lease_until = NULL, version = version + 1,
                updated_at = UTC_TIMESTAMP(6)
            WHERE reminder_id = #{reminderId}
              AND source_type IN ('REMINDER_DUE', 'REMINDER_CHECK')
              AND status IN ('QUEUED', 'PROCESSING')
            """)
    int cancelReminderDeliveries(@Param("reminderId") long reminderId);

    @Select("""
            SELECT id FROM notification
            WHERE resource_type = 'COMMITMENT' AND resource_id = #{id} FOR UPDATE
            """)
    List<Long> lockNotifications(@Param("id") long id);

    @Update("""
            UPDATE notification_delivery AS d
            JOIN notification AS n ON n.id = d.notification_id
            SET d.status = 'CANCELLED', d.lock_token = NULL, d.lease_until = NULL,
                d.version = d.version + 1, d.updated_at = UTC_TIMESTAMP(6)
            WHERE n.resource_type = 'COMMITMENT' AND n.resource_id = #{id}
              AND d.status IN ('QUEUED', 'PROCESSING')
            """)
    int cancelNotificationDeliveries(@Param("id") long id);

    @Update("""
            UPDATE notification SET invalidated_at = UTC_TIMESTAMP(6),
                version = version + 1, updated_at = UTC_TIMESTAMP(6)
            WHERE resource_type = 'COMMITMENT' AND resource_id = #{id}
              AND invalidated_at IS NULL
            """)
    int invalidateNotifications(@Param("id") long id);
}
