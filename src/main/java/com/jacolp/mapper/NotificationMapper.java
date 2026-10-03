package com.jacolp.mapper;

import com.jacolp.entity.Notification;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface NotificationMapper {
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
}
