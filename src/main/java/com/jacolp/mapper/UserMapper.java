package com.jacolp.mapper;

import com.jacolp.entity.AppUser;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface UserMapper {
    @Select("""
            SELECT id, username, password_hash, nickname, avatar_style, timezone,
                   notification_email, active_connection_id, share_availability, version
            FROM app_user WHERE username = #{username}
            """)
    AppUser findByUsername(@Param("username") String username);

    @Select("""
            SELECT id, username, password_hash, nickname, avatar_style, timezone,
                   notification_email, active_connection_id, share_availability, version
            FROM app_user WHERE username = #{username} FOR UPDATE
            """)
    AppUser lockByUsername(@Param("username") String username);

    @Select("""
            SELECT id, username, password_hash, nickname, avatar_style, timezone,
                   notification_email, active_connection_id, share_availability, version
            FROM app_user WHERE id = #{id} FOR UPDATE
            """)
    AppUser lockById(@Param("id") long id);

    @Select("""
            SELECT COUNT(*) FROM pair_connection
            WHERE id = #{connectionId} AND status = 'ACTIVE'
              AND (user_a_id = #{userId} OR user_b_id = #{userId})
            """)
    long countActiveConnection(@Param("connectionId") long connectionId,
                               @Param("userId") long userId);

    @Select("SELECT COUNT(*) FROM app_user")
    long countUsers();

    @Insert("""
            INSERT INTO app_user (username, password_hash, nickname, timezone)
            VALUES (#{username}, #{passwordHash}, #{nickname}, #{timezone})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(AppUser user);

    @Update("""
            UPDATE app_user SET password_hash = #{hash}, version = version + 1
            WHERE id = #{id}
            """)
    int updatePassword(@Param("id") long id, @Param("hash") String hash);

    @Update("""
            UPDATE app_user SET nickname = #{nickname}, avatar_style = #{avatarStyle},
                timezone = #{timezone}, notification_email = #{notificationEmail},
                share_availability = #{shareAvailability}, version = version + 1
            WHERE id = #{id} AND version = #{version}
            """)
    int updateProfile(AppUser user);

    @Update("""
            UPDATE notification_delivery SET status = 'CANCELLED', lock_token = NULL,
                lease_until = NULL, version = version + 1
            WHERE recipient_id = #{userId} AND to_address = #{oldAddress}
              AND status IN ('QUEUED', 'PROCESSING')
            """)
    int cancelOldAddressDeliveries(@Param("userId") long userId,
                                   @Param("oldAddress") String oldAddress);

    @Delete("""
            DELETE s, a FROM SPRING_SESSION AS s
            LEFT JOIN SPRING_SESSION_ATTRIBUTES AS a ON a.SESSION_PRIMARY_ID = s.PRIMARY_ID
            WHERE s.PRINCIPAL_NAME = #{username}
            """)
    int deleteSessionsByPrincipal(@Param("username") String username);

    @Select("SELECT COUNT(*) FROM commitment WHERE owner_id = #{ownerId} AND status = 'OPEN'")
    long countOpenCommitments(@Param("ownerId") long ownerId);

    @Select("""
            SELECT COUNT(*) FROM memory_card
            WHERE owner_id = #{ownerId} AND archived = TRUE AND deleted_at IS NULL
            """)
    long countArchivedMemories(@Param("ownerId") long ownerId);
}
