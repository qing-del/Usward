package com.jacolp.mapper;

import com.jacolp.entity.MemoryCard;
import com.jacolp.entity.MemoryTag;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface MemoryMapper {
    @Insert("""
            INSERT INTO memory_card (owner_id, title, body, category, source_type, source_date, next_action)
            VALUES (#{ownerId}, #{title}, #{body}, #{category}, #{sourceType}, #{sourceDate}, #{nextAction})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(MemoryCard card);

    @Select("""
            SELECT id, owner_id, shared_connection_id, title, body, category, source_type,
                   source_date, next_action, archived, deleted_at, created_at, updated_at, version
            FROM memory_card
            WHERE id = #{id} AND owner_id = #{ownerId} AND deleted_at IS NULL
            """)
    MemoryCard findOwned(@Param("id") long id, @Param("ownerId") long ownerId);

    @Select("""
            SELECT id, owner_id, shared_connection_id, title, body, category, source_type,
                   source_date, next_action, archived, deleted_at, created_at, updated_at, version
            FROM memory_card
            WHERE id = #{id} AND owner_id = #{ownerId} AND deleted_at IS NULL
            FOR UPDATE
            """)
    MemoryCard lockOwned(@Param("id") long id, @Param("ownerId") long ownerId);

    @Update("""
            UPDATE memory_card SET title = #{title}, body = #{body}, category = #{category},
                   source_type = #{sourceType}, source_date = #{sourceDate}, next_action = #{nextAction},
                   updated_at = UTC_TIMESTAMP(6), version = version + 1
            WHERE id = #{id} AND owner_id = #{ownerId} AND deleted_at IS NULL
              AND version = #{version}
            """)
    int updateContent(MemoryCard card);

    @Update("""
            UPDATE memory_card SET archived = #{archived}, updated_at = UTC_TIMESTAMP(6),
                   version = version + 1
            WHERE id = #{id} AND owner_id = #{ownerId} AND deleted_at IS NULL
              AND version = #{version}
            """)
    int setArchived(@Param("id") long id, @Param("ownerId") long ownerId,
                    @Param("version") long version, @Param("archived") boolean archived);

    @Update("""
            UPDATE memory_card SET deleted_at = UTC_TIMESTAMP(6), updated_at = UTC_TIMESTAMP(6),
                   version = version + 1
            WHERE id = #{id} AND owner_id = #{ownerId} AND deleted_at IS NULL
              AND version = #{version}
            """)
    int softDelete(@Param("id") long id, @Param("ownerId") long ownerId,
                   @Param("version") long version);

    @Insert("INSERT INTO memory_tag (card_id, tag) VALUES (#{cardId}, #{tag})")
    int insertTag(@Param("cardId") long cardId, @Param("tag") String tag);

    @Delete("DELETE FROM memory_tag WHERE card_id = #{cardId}")
    int deleteTags(@Param("cardId") long cardId);

    @Select("SELECT tag FROM memory_tag WHERE card_id = #{cardId} ORDER BY tag")
    List<String> tagsForCard(@Param("cardId") long cardId);

    @Select({"<script>",
            "SELECT card_id, tag FROM memory_tag WHERE card_id IN",
            "<foreach collection='ids' item='id' open='(' separator=',' close=')'>#{id}</foreach>",
            "ORDER BY tag", "</script>"})
    List<MemoryTag> tagsForCards(@Param("ids") List<Long> ids);

    @Select("""
            SELECT COUNT(*) FROM memory_card AS c
            WHERE c.owner_id = #{ownerId} AND c.deleted_at IS NULL AND c.archived = #{archived}
              AND (#{pattern} IS NULL OR c.title LIKE #{pattern} ESCAPE '!'
                   OR c.body LIKE #{pattern} ESCAPE '!')
              AND (#{category} IS NULL OR c.category = #{category})
              AND (#{tag} IS NULL OR EXISTS
                   (SELECT 1 FROM memory_tag AS t WHERE t.card_id = c.id AND t.tag = #{tag}))
            """)
    long count(@Param("ownerId") long ownerId, @Param("archived") boolean archived,
               @Param("pattern") String pattern, @Param("category") String category,
               @Param("tag") String tag);

    @Select("""
            SELECT c.id, c.owner_id, c.title, c.category, c.source_type,
                   c.shared_connection_id, c.created_at, c.updated_at, c.version
            FROM memory_card AS c
            WHERE c.owner_id = #{ownerId} AND c.deleted_at IS NULL AND c.archived = #{archived}
              AND (#{pattern} IS NULL OR c.title LIKE #{pattern} ESCAPE '!'
                   OR c.body LIKE #{pattern} ESCAPE '!')
              AND (#{category} IS NULL OR c.category = #{category})
              AND (#{tag} IS NULL OR EXISTS
                   (SELECT 1 FROM memory_tag AS t WHERE t.card_id = c.id AND t.tag = #{tag}))
            ORDER BY c.updated_at DESC, c.id DESC
            LIMIT #{size} OFFSET #{offset}
            """)
    List<MemoryCard> page(@Param("ownerId") long ownerId, @Param("archived") boolean archived,
                          @Param("pattern") String pattern, @Param("category") String category,
                          @Param("tag") String tag, @Param("size") int size,
                          @Param("offset") long offset);

    @Select("""
            SELECT t.tag, COUNT(*) AS count FROM memory_tag AS t
            JOIN memory_card AS c ON c.id = t.card_id
            WHERE c.owner_id = #{ownerId} AND c.deleted_at IS NULL AND c.archived = #{archived}
              AND (#{pattern} IS NULL OR c.title LIKE #{pattern} ESCAPE '!'
                   OR c.body LIKE #{pattern} ESCAPE '!')
              AND (#{category} IS NULL OR c.category = #{category})
            GROUP BY t.tag ORDER BY count DESC, t.tag ASC
            """)
    List<MemoryTag> availableTags(@Param("ownerId") long ownerId,
                                  @Param("archived") boolean archived,
                                  @Param("pattern") String pattern,
                                  @Param("category") String category);
}
