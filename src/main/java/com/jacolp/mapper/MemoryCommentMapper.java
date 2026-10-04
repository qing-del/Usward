package com.jacolp.mapper;

import com.jacolp.entity.MemoryComment;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface MemoryCommentMapper {
    String COLUMNS = "id, card_id, connection_id, author_id, body, created_at";

    @Insert("""
            INSERT INTO memory_comment (card_id, connection_id, author_id, body)
            VALUES (#{cardId}, #{connectionId}, #{authorId}, #{body})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(MemoryComment comment);

    @Select("SELECT " + COLUMNS + " FROM memory_comment WHERE id = #{id} "
            + "AND card_id = #{cardId} AND connection_id = #{connectionId}")
    MemoryComment find(@Param("id") long id, @Param("cardId") long cardId,
                       @Param("connectionId") long connectionId);

    @Select("SELECT " + COLUMNS + " FROM memory_comment WHERE id = #{id} "
            + "AND card_id = #{cardId} AND connection_id = #{connectionId} FOR UPDATE")
    MemoryComment lock(@Param("id") long id, @Param("cardId") long cardId,
                       @Param("connectionId") long connectionId);

    @Select("SELECT COUNT(*) FROM memory_comment WHERE card_id = #{cardId} "
            + "AND connection_id = #{connectionId}")
    long count(@Param("cardId") long cardId, @Param("connectionId") long connectionId);

    @Select("SELECT " + COLUMNS + " FROM memory_comment WHERE card_id = #{cardId} "
            + "AND connection_id = #{connectionId} "
            + "ORDER BY created_at ASC, id ASC LIMIT #{size} OFFSET #{offset}")
    List<MemoryComment> page(@Param("cardId") long cardId,
                             @Param("connectionId") long connectionId,
                             @Param("size") int size, @Param("offset") long offset);
}
