package com.jacolp.mapper;

import com.jacolp.entity.CalendarEvent;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface CalendarMapper {
    String COLUMNS = """
            id, owner_id, connection_id, kind, title, starts_at, ends_at,
            start_date, end_date_exclusive, event_timezone, note, location,
            availability, share_title, offline_confirmed_at, status,
            origin_invitation_id, pending_change_invitation_id, cancellation_reason,
            created_at, updated_at, version
            """;

    @Insert("""
            INSERT INTO calendar_event
              (owner_id, kind, title, starts_at, ends_at, start_date, end_date_exclusive,
               event_timezone, note, location, availability, share_title, offline_confirmed_at)
            VALUES
              (#{ownerId}, 'PERSONAL', #{title}, #{startsAt}, #{endsAt}, #{startDate},
               #{endDateExclusive}, #{eventTimezone}, #{note}, #{location},
               #{availability}, #{shareTitle}, #{offlineConfirmedAt})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(CalendarEvent event);

    @Select("SELECT " + COLUMNS + " FROM calendar_event WHERE id = #{id} AND owner_id = #{ownerId} "
            + "AND kind = 'PERSONAL' AND status = 'CONFIRMED'")
    CalendarEvent findOwned(@Param("id") long id, @Param("ownerId") long ownerId);

    @Select("SELECT " + COLUMNS + " FROM calendar_event WHERE id = #{id} AND owner_id = #{ownerId} "
            + "AND kind = 'PERSONAL' AND status = 'CONFIRMED' FOR UPDATE")
    CalendarEvent lockOwned(@Param("id") long id, @Param("ownerId") long ownerId);

    @Update("""
            UPDATE calendar_event SET title = #{title}, starts_at = #{startsAt},
                ends_at = #{endsAt}, start_date = #{startDate},
                end_date_exclusive = #{endDateExclusive}, event_timezone = #{eventTimezone},
                note = #{note}, location = #{location}, availability = #{availability},
                share_title = #{shareTitle}, offline_confirmed_at = #{offlineConfirmedAt},
                version = version + 1
            WHERE id = #{id} AND owner_id = #{ownerId} AND kind = 'PERSONAL'
              AND status = 'CONFIRMED' AND version = #{version}
            """)
    int updateOwned(CalendarEvent event);

    @Delete("""
            DELETE FROM calendar_event
            WHERE id = #{id} AND owner_id = #{ownerId} AND kind = 'PERSONAL'
              AND status = 'CONFIRMED' AND version = #{expectedVersion}
            """)
    int deleteOwned(@Param("id") long id, @Param("ownerId") long ownerId,
                    @Param("expectedVersion") long expectedVersion);

    @Select("""
            SELECT
            """ + COLUMNS + """
            FROM calendar_event
            WHERE owner_id = #{ownerId} AND kind = 'PERSONAL' AND status = 'CONFIRMED'
              AND starts_at IS NOT NULL AND starts_at < #{toUtc} AND ends_at > #{fromUtc}
            """)
    List<CalendarEvent> timedInRange(@Param("ownerId") long ownerId,
                                     @Param("fromUtc") LocalDateTime fromUtc,
                                     @Param("toUtc") LocalDateTime toUtc);

    @Select("""
            SELECT
            """ + COLUMNS + """
            FROM calendar_event
            WHERE owner_id = #{ownerId} AND kind = 'PERSONAL' AND status = 'CONFIRMED'
              AND start_date IS NOT NULL
              AND start_date <= COALESCE(DATE_ADD(#{toUtcDate}, INTERVAL 2 DAY), '9999-12-31')
              AND end_date_exclusive > DATE_SUB(#{fromUtcDate}, INTERVAL 2 DAY)
            """)
    List<CalendarEvent> allDayCandidates(@Param("ownerId") long ownerId,
                                         @Param("fromUtcDate") LocalDate fromUtcDate,
                                         @Param("toUtcDate") LocalDate toUtcDate);
}
