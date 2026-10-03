package com.jacolp.mapper;

import com.jacolp.entity.PairConnection;
import com.jacolp.entity.PairInvite;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ConnectionMapper {
    String INVITE_COLUMNS = "id, inviter_id, token_hash, expires_at, status, accepted_by, version";
    String CONNECTION_COLUMNS = "id, user_a_id, user_b_id, status, version";

    @Select("SELECT " + INVITE_COLUMNS + " FROM pair_invite WHERE token_hash = #{hash}")
    PairInvite inviteByHash(@Param("hash") String hash);

    @Select("SELECT " + INVITE_COLUMNS + " FROM pair_invite WHERE id = #{id} FOR UPDATE")
    PairInvite lockInvite(@Param("id") long id);

    @Select("SELECT " + INVITE_COLUMNS + " FROM pair_invite WHERE id = #{id} AND inviter_id = #{inviterId}")
    PairInvite ownedInvite(@Param("id") long id, @Param("inviterId") long inviterId);

    @Select("SELECT " + INVITE_COLUMNS + " FROM pair_invite "
            + "WHERE inviter_id = #{inviterId} AND status = 'PENDING' "
            + "AND expires_at > UTC_TIMESTAMP(6) ORDER BY id DESC LIMIT 1")
    PairInvite currentInvite(@Param("inviterId") long inviterId);

    @Insert("""
            INSERT INTO pair_invite (inviter_id, token_hash, expires_at)
            VALUES (#{inviterId}, #{tokenHash}, #{expiresAt})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertInvite(PairInvite invite);

    @Update("""
            UPDATE pair_invite SET status = 'REVOKED', version = version + 1,
                updated_at = UTC_TIMESTAMP(6)
            WHERE inviter_id = #{inviterId} AND status = 'PENDING' AND id <> #{exceptId}
            """)
    int revokePending(@Param("inviterId") long inviterId, @Param("exceptId") long exceptId);

    @Update("""
            UPDATE pair_invite SET status = 'REVOKED', version = version + 1,
                updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{id} AND inviter_id = #{inviterId} AND status = 'PENDING'
              AND version = #{version} AND expires_at > UTC_TIMESTAMP(6)
            """)
    int revoke(@Param("id") long id, @Param("inviterId") long inviterId,
               @Param("version") long version);

    @Update("""
            UPDATE pair_invite SET status = 'ACCEPTED', accepted_by = #{acceptedBy},
                version = version + 1, updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{id} AND status = 'PENDING' AND version = #{version}
              AND expires_at > UTC_TIMESTAMP(6)
            """)
    int accept(@Param("id") long id, @Param("version") long version,
               @Param("acceptedBy") long acceptedBy);

    @Insert("INSERT INTO pair_connection (user_a_id, user_b_id) VALUES (#{userAId}, #{userBId})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertConnection(PairConnection connection);

    @Select("SELECT " + CONNECTION_COLUMNS + " FROM pair_connection WHERE id = #{id} AND status = 'ACTIVE'")
    PairConnection activeConnection(@Param("id") long id);

    @Select("SELECT " + CONNECTION_COLUMNS + " FROM pair_connection WHERE id = #{id} AND status = 'ACTIVE' FOR UPDATE")
    PairConnection lockActiveConnection(@Param("id") long id);

    @Update("""
            UPDATE pair_connection SET status = 'ENDED', ended_at = UTC_TIMESTAMP(6),
                version = version + 1, updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{id} AND status = 'ACTIVE' AND version = #{version}
            """)
    int end(@Param("id") long id, @Param("version") long version);

    @Select("SELECT id FROM memory_card WHERE shared_connection_id = #{connectionId} AND owner_id = #{ownerId}")
    List<Long> sharedCards(@Param("connectionId") long connectionId, @Param("ownerId") long ownerId);

    @Select("SELECT id FROM commitment WHERE shared_connection_id = #{connectionId} AND owner_id = #{ownerId}")
    List<Long> sharedCommitments(@Param("connectionId") long connectionId, @Param("ownerId") long ownerId);

    @Select("SELECT id FROM calendar_event WHERE connection_id = #{connectionId} AND kind = 'SHARED'")
    List<Long> sharedEvents(@Param("connectionId") long connectionId);

    @Select("SELECT id FROM expression WHERE connection_id = #{connectionId}")
    List<Long> expressions(@Param("connectionId") long connectionId);

    @Select("SELECT id FROM calendar_invitation WHERE connection_id = #{connectionId}")
    List<Long> calendarInvitations(@Param("connectionId") long connectionId);

    @Update("""
            UPDATE memory_card SET shared_connection_id = NULL, version = version + 1,
                updated_at = UTC_TIMESTAMP(6) WHERE shared_connection_id = #{connectionId}
            """)
    int unshareCards(@Param("connectionId") long connectionId);

    @Update("""
            UPDATE commitment SET shared_connection_id = NULL, version = version + 1,
                updated_at = UTC_TIMESTAMP(6) WHERE shared_connection_id = #{connectionId}
            """)
    int unshareCommitments(@Param("connectionId") long connectionId);

    @Update("""
            UPDATE calendar_event SET share_title = FALSE, version = version + 1,
                updated_at = UTC_TIMESTAMP(6)
            WHERE kind = 'PERSONAL' AND owner_id IN (#{userAId}, #{userBId})
              AND share_title = TRUE
            """)
    int clearPersonalEventTitles(@Param("userAId") long userAId,
                                 @Param("userBId") long userBId);

    @Delete("DELETE FROM memory_comment WHERE connection_id = #{connectionId}")
    int deleteComments(@Param("connectionId") long connectionId);

    @Delete("DELETE FROM notification_setting WHERE connection_id = #{connectionId}")
    int deleteNotificationSettings(@Param("connectionId") long connectionId);
}
