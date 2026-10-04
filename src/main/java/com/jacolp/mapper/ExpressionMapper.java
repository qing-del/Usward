package com.jacolp.mapper;

import com.jacolp.entity.Expression;
import com.jacolp.entity.ExpressionReply;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface ExpressionMapper {
    String COLUMNS = "id, connection_id, sender_id, recipient_id, type, body, response_window, "
            + "response_mode, status, created_at, updated_at, version";
    String REPLY_COLUMNS = "id, expression_id, author_id, preset, body, created_at";

    @Insert("""
            INSERT INTO expression (connection_id, sender_id, recipient_id, type, body,
                                    response_window, response_mode)
            VALUES (#{connectionId}, #{senderId}, #{recipientId}, #{type}, #{body},
                    #{responseWindow}, #{responseMode})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Expression row);

    @Select("SELECT " + COLUMNS + " FROM expression WHERE id = #{id}")
    Expression find(@Param("id") long id);

    @Select("SELECT " + COLUMNS + " FROM expression WHERE id = #{id} FOR UPDATE")
    Expression lock(@Param("id") long id);

    @Select("SELECT " + COLUMNS + " FROM expression WHERE connection_id = #{connectionId} "
            + "ORDER BY created_at DESC, id DESC")
    List<Expression> listConnection(@Param("connectionId") long connectionId);

    @Update("""
            UPDATE expression SET status = 'WITHDRAWN', body = NULL, version = version + 1,
                updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{id} AND sender_id = #{senderId} AND connection_id = #{connectionId}
              AND status IN ('OPEN', 'RESPONDED') AND version = #{version}
            """)
    int withdraw(@Param("id") long id, @Param("senderId") long senderId,
                 @Param("connectionId") long connectionId, @Param("version") long version);

    @Update("""
            UPDATE expression SET status = #{status}, version = version + 1,
                updated_at = UTC_TIMESTAMP(6)
            WHERE id = #{id} AND connection_id = #{connectionId} AND status <> 'WITHDRAWN'
              AND version = #{version}
            """)
    int bump(@Param("id") long id, @Param("connectionId") long connectionId,
             @Param("version") long version, @Param("status") String status);

    @Insert("""
            INSERT INTO expression_reply (expression_id, author_id, preset, body)
            VALUES (#{expressionId}, #{authorId}, #{preset}, #{body})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertReply(ExpressionReply row);

    @Select("SELECT " + REPLY_COLUMNS + " FROM expression_reply WHERE id = #{id} "
            + "AND expression_id = #{expressionId}")
    ExpressionReply reply(@Param("id") long id, @Param("expressionId") long expressionId);

    @Select("SELECT COUNT(*) FROM expression_reply WHERE expression_id = #{expressionId}")
    long replyCount(@Param("expressionId") long expressionId);

    @Select("SELECT " + REPLY_COLUMNS + " FROM expression_reply WHERE expression_id = #{expressionId} "
            + "ORDER BY created_at DESC, id DESC LIMIT 1")
    ExpressionReply lastReply(@Param("expressionId") long expressionId);

    @Select("SELECT " + REPLY_COLUMNS + " FROM expression_reply WHERE expression_id = #{expressionId} "
            + "ORDER BY created_at ASC, id ASC LIMIT #{limit} OFFSET #{offset}")
    List<ExpressionReply> replies(@Param("expressionId") long expressionId,
                                  @Param("limit") int limit, @Param("offset") long offset);
}
