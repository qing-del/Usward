package com.jacolp.mapper;

import com.jacolp.entity.Reminder;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ReminderMapper {
    String COLUMNS = "id, recipient_id, resource_type, resource_id, scheduled_at, "
            + "delivery_mode, revision, status, created_at, updated_at, version";

    @Insert("""
            INSERT INTO reminder (recipient_id, resource_type, resource_id, scheduled_at,
                                  delivery_mode)
            VALUES (#{recipientId}, #{resourceType}, #{resourceId}, #{scheduledAt},
                    #{deliveryMode})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Reminder reminder);

    @Select("SELECT " + COLUMNS + " FROM reminder WHERE recipient_id = #{recipientId} "
            + "AND resource_type = #{resourceType} AND resource_id = #{resourceId}")
    Reminder findResource(@Param("recipientId") long recipientId,
                          @Param("resourceType") String resourceType,
                          @Param("resourceId") long resourceId);

    @Select("SELECT " + COLUMNS + " FROM reminder WHERE recipient_id = #{recipientId} "
            + "AND resource_type = #{resourceType} AND resource_id = #{resourceId} FOR UPDATE")
    Reminder lockResource(@Param("recipientId") long recipientId,
                          @Param("resourceType") String resourceType,
                          @Param("resourceId") long resourceId);

    @Select("SELECT " + COLUMNS + " FROM reminder WHERE id = #{id} AND recipient_id = #{recipientId}")
    Reminder findOwned(@Param("id") long id, @Param("recipientId") long recipientId);

    @Select("SELECT " + COLUMNS + " FROM reminder WHERE id = #{id}")
    Reminder findById(@Param("id") long id);

    @Select("""
            SELECT id FROM reminder WHERE status = 'PENDING'
              AND scheduled_at <= UTC_TIMESTAMP(6)
            ORDER BY scheduled_at ASC, id ASC LIMIT 20
            """)
    List<Long> dueIds();

    @Select("SELECT " + COLUMNS + " FROM reminder WHERE id = #{id} AND recipient_id = #{recipientId} FOR UPDATE")
    Reminder lockOwned(@Param("id") long id, @Param("recipientId") long recipientId);

    @Select("SELECT " + COLUMNS + " FROM reminder WHERE recipient_id = #{recipientId} "
            + "ORDER BY scheduled_at ASC, id ASC")
    List<Reminder> listRecipient(@Param("recipientId") long recipientId);

    @Update("""
            UPDATE reminder SET scheduled_at = #{scheduledAt}, delivery_mode = #{deliveryMode},
                status = 'PENDING', revision = revision + 1, version = version + 1,
                updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{id} AND recipient_id = #{recipientId} AND revision = #{revision}
            """)
    int reschedule(@Param("id") long id, @Param("recipientId") long recipientId,
                   @Param("revision") long revision,
                   @Param("scheduledAt") java.time.LocalDateTime scheduledAt,
                   @Param("deliveryMode") String deliveryMode);

    @Update("""
            UPDATE reminder SET status = 'CANCELLED', revision = revision + 1,
                version = version + 1, updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{id} AND recipient_id = #{recipientId}
              AND revision = #{revision} AND status IN ('PENDING', 'FIRED')
            """)
    int cancel(@Param("id") long id, @Param("recipientId") long recipientId,
               @Param("revision") long revision);

    @Update("""
            UPDATE reminder SET status = 'FIRED', version = version + 1,
                updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{id} AND recipient_id = #{recipientId}
              AND status = 'PENDING' AND revision = #{revision}
              AND scheduled_at <= UTC_TIMESTAMP(6)
            """)
    int markFired(@Param("id") long id, @Param("recipientId") long recipientId,
                  @Param("revision") long revision);

    @Update("""
            UPDATE notification_delivery SET status = 'CANCELLED', lock_token = NULL,
                lease_until = NULL, version = version + 1, updated_at = UTC_TIMESTAMP(6)
            WHERE reminder_id = #{reminderId}
              AND source_type IN ('REMINDER_DUE', 'REMINDER_CHECK')
              AND status IN ('QUEUED', 'PROCESSING')
            """)
    int cancelDeliveries(@Param("reminderId") long reminderId);

    @Select("""
            SELECT id FROM notification WHERE resource_type = #{resourceType}
              AND resource_id = #{resourceId} FOR UPDATE
            """)
    List<Long> lockNotifications(@Param("resourceType") String resourceType,
                                 @Param("resourceId") long resourceId);

    @Update("""
            UPDATE notification_delivery AS d JOIN notification AS n ON n.id = d.notification_id
            SET d.status = 'CANCELLED', d.lock_token = NULL, d.lease_until = NULL,
                d.version = d.version + 1, d.updated_at = UTC_TIMESTAMP(6)
            WHERE n.resource_type = #{resourceType} AND n.resource_id = #{resourceId}
              AND d.status IN ('QUEUED', 'PROCESSING')
            """)
    int cancelResourceDeliveries(@Param("resourceType") String resourceType,
                                 @Param("resourceId") long resourceId);

    @Update("""
            UPDATE notification SET invalidated_at = UTC_TIMESTAMP(6),
                version = version + 1, updated_at = UTC_TIMESTAMP(6)
            WHERE resource_type = #{resourceType} AND resource_id = #{resourceId}
              AND invalidated_at IS NULL
            """)
    int invalidateNotifications(@Param("resourceType") String resourceType,
                                @Param("resourceId") long resourceId);
}
