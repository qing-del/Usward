package com.jacolp.mapper;

import com.jacolp.entity.AppUser;
import org.apache.ibatis.annotations.Insert;
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

    @Select("SELECT COUNT(*) FROM commitment WHERE owner_id = #{ownerId} AND status = 'OPEN'")
    long countOpenCommitments(@Param("ownerId") long ownerId);

    @Select("""
            SELECT COUNT(*) FROM memory_card
            WHERE owner_id = #{ownerId} AND archived = TRUE AND deleted_at IS NULL
            """)
    long countArchivedMemories(@Param("ownerId") long ownerId);
}
