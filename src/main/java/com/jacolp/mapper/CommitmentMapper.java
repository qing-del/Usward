package com.jacolp.mapper;

import com.jacolp.entity.Commitment;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CommitmentMapper {
    String COLUMNS = """
            id, owner_id, shared_connection_id, title, body, due_kind, due_at, due_date,
            due_timezone, next_action, status, result, source_type, source_id,
            created_at, updated_at, version
            """;

    @Insert("""
            INSERT INTO commitment
              (owner_id, title, body, due_kind, due_at, due_date, due_timezone,
               next_action, source_type, source_id)
            VALUES
              (#{ownerId}, #{title}, #{body}, #{dueKind}, #{dueAt}, #{dueDate},
               #{dueTimezone}, #{nextAction}, #{sourceType}, #{sourceId})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(Commitment commitment);

    @Select("SELECT " + COLUMNS + " FROM commitment WHERE id = #{id} AND owner_id = #{ownerId} "
            + "AND shared_connection_id IS NULL")
    Commitment findOwned(@Param("id") long id, @Param("ownerId") long ownerId);
}
