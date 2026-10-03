package com.jacolp.mapper;

import com.jacolp.entity.Notification;
import com.jacolp.entity.NotificationDelivery;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface NotificationMapper {
    String COLUMNS = "id, recipient_id, kind, resource_type, resource_id, message, "
            + "dedupe_key, created_at, read_at, invalidated_at, updated_at, version";

    @Insert("""
            INSERT INTO notification (recipient_id, kind, resource_type, resource_id,
                                      message, dedupe_key)
            VALUES (#{recipientId}, #{kind}, #{resourceType}, #{resourceId},
                    #{message}, #{dedupeKey})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Notification notification);

    @Insert("""
            INSERT INTO notification_delivery
              (notification_id, source_type, reminder_id, reminder_revision, recipient_id,
               channel, to_address, status, last_error_code)
            VALUES (#{notificationId}, 'REMINDER_DUE', #{reminderId}, #{revision},
                    #{recipientId}, 'MAIL', #{toAddress}, 'FAILED', 'MAIL_DISABLED')
            """)
    int insertDisabledMail(@Param("notificationId") long notificationId,
                           @Param("reminderId") long reminderId,
                           @Param("revision") long revision,
                           @Param("recipientId") long recipientId,
                           @Param("toAddress") String toAddress);

    @Select("SELECT " + COLUMNS + " FROM notification WHERE recipient_id = #{recipientId} "
            + "AND invalidated_at IS NULL ORDER BY created_at DESC, id DESC")
    List<Notification> listRecipient(@Param("recipientId") long recipientId);

    @Select("SELECT " + COLUMNS + " FROM notification WHERE id = #{id} "
            + "AND recipient_id = #{recipientId} AND invalidated_at IS NULL")
    Notification findOwned(@Param("id") long id, @Param("recipientId") long recipientId);

    @Select("""
            SELECT status, sent_at, last_error_code FROM notification_delivery
            WHERE notification_id = #{notificationId} AND channel = 'MAIL'
            """)
    NotificationDelivery delivery(@Param("notificationId") long notificationId);

    @Update("""
            UPDATE notification SET read_at = UTC_TIMESTAMP(6), updated_at = UTC_TIMESTAMP(6),
                version = version + 1
            WHERE id = #{id} AND recipient_id = #{recipientId}
              AND invalidated_at IS NULL AND read_at IS NULL
            """)
    int markRead(@Param("id") long id, @Param("recipientId") long recipientId);
}
