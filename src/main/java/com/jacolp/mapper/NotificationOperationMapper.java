package com.jacolp.mapper;

import com.jacolp.entity.NotificationOperation;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface NotificationOperationMapper {
    @Select("SELECT id, actor_id, idempotency_key, request_hash, action, resource_type, "
            + "resource_id, result_refs FROM notification_operation WHERE actor_id = #{actorId} "
            + "AND idempotency_key = #{key}")
    NotificationOperation find(@Param("actorId") long actorId, @Param("key") String key);

    @Select("SELECT id, actor_id, idempotency_key, request_hash, action, resource_type, "
            + "resource_id, result_refs FROM notification_operation WHERE actor_id = #{actorId} "
            + "AND idempotency_key = #{key} FOR UPDATE")
    NotificationOperation lock(@Param("actorId") long actorId, @Param("key") String key);

    @Insert("""
            INSERT INTO notification_operation
              (actor_id, idempotency_key, request_hash, action, resource_type,
               resource_id, result_refs)
            VALUES (#{actorId}, #{idempotencyKey}, #{requestHash}, #{action},
                    #{resourceType}, #{resourceId}, #{resultRefs})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(NotificationOperation operation);
}
