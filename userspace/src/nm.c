/*
 * nm.c - NoMount CLI Userspace Tool
 */
#include "nm.h"

/* --- MAIN --- */
__attribute__((noreturn, used))
void c_main(long *sp) {
    long argc = *sp;
    char **argv = (char **)(sp + 1);
    int exit_code = 1;

    struct nm_workspace workspace;
    struct nm_payload *payload = &workspace.payload;
    enum nm_cli_action action = ACTION_NONE;
    int data_start_idx = 2;
    int is_json = 0;
    int is_whiteout = 0;
    unsigned int target_uid = 0;

    payload->magic = NOMOUNT_MAGIC_SIG;

    if (argc >= 2) {
        const char *c1 = argv[1];
        if (strcmp(c1, "rule") == 0 && argc >= 3) {
            const char *c2 = argv[2];
            if (strcmp(c2, "add") == 0) action = ACTION_RULE_ADD;
            else if (strcmp(c2, "del") == 0) action = ACTION_RULE_DEL;
            else if (strcmp(c2, "list") == 0) action = ACTION_RULE_LIST;
            else if (strcmp(c2, "clear") == 0) action = ACTION_RULE_CLEAR;
            data_start_idx = 3;
        } else if (strcmp(c1, "uid") == 0 && argc >= 3) {
            const char *c2 = argv[2];
            if (strcmp(c2, "add") == 0) action = ACTION_UID_ADD;
            else if (strcmp(c2, "del") == 0) action = ACTION_UID_DEL;
            else if (strcmp(c2, "list") == 0) action = ACTION_UID_LIST;
            else if (strcmp(c2, "clear") == 0) action = ACTION_UID_CLEAR;
            data_start_idx = 3;
        } else if (strcmp(c1, "clear") == 0) {
            if (argc >= 3 && strcmp(argv[2], "rules") == 0) action = ACTION_RULE_CLEAR;
            else if (argc >= 3 && strcmp(argv[2], "uid") == 0) action = ACTION_UID_CLEAR;
            else if (argc >= 3 && strcmp(argv[2], "all") == 0) action = ACTION_CLEAR_ALL;
            else action = ACTION_CLEAR_ALL;
            data_start_idx = (argc >= 3) ? 3 : 2;
        }
        /* legacy commands */
        else if (strcmp(c1, "add") == 0 || strcmp(c1, "a") == 0) { action = ACTION_RULE_ADD; }
        else if (strcmp(c1, "w") == 0 || strcmp(c1, "whiteout") == 0) { action = ACTION_RULE_ADD; is_whiteout = 1; }
        else if (strcmp(c1, "del") == 0 || strcmp(c1, "d") == 0) { action = ACTION_RULE_DEL; }
        else if (strcmp(c1, "block") == 0 || strcmp(c1, "b") == 0) { action = ACTION_UID_ADD; }
        else if (strcmp(c1, "unblock") == 0 || strcmp(c1, "u") == 0) { action = ACTION_UID_DEL; }
        else if (strcmp(c1, "list") == 0 || strcmp(c1, "l") == 0) {
            if (argc >= 3 && strcmp(argv[2], "uid") == 0) { action = ACTION_UID_LIST; data_start_idx = 3; }
            else { action = ACTION_RULE_LIST; }
        } else if (strcmp(c1, "version") == 0 || strcmp(c1, "v") == 0 || strcmp(c1, "-v") == 0) { action = ACTION_VERSION; }
    }

    int p_count = 0;

    if (argc >= 2) {
        for (int i = data_start_idx; i < argc; i++) {
            if (strcmp(argv[i], "--uid") == 0 && i + 1 < argc) {
                const char *s = argv[++i];
                while (*s) target_uid = (target_uid << 3) + (target_uid << 1) + (*s++ - '0');
            } 
            else if (strcmp(argv[i], "--json") == 0 || strcmp(argv[i], "json") == 0) { is_json = 1; }
            else if (strcmp(argv[i], "--whiteout") == 0) { is_whiteout = 1; }
            else { argv[p_count++] = argv[i]; }
        }
    }

    switch (action) {
        case ACTION_RULE_ADD:
        case ACTION_RULE_DEL: {
            int step = (action == ACTION_RULE_ADD && !is_whiteout) ? 2 : 1;
            if (p_count < step) { exit_code = 0; goto do_exit; }

            char *cwd_buf = workspace.cwd;
            const char *cwd = (sys3(SYS_GETCWD, (long)cwd_buf, PATH_MAX, 0) > 0) ? cwd_buf : "/";
            int target_cmd = (action == ACTION_RULE_DEL) ? NM_CMD_DEL_RULE : NM_CMD_ADD_RULE;

            exit_code = 0;
            payload->cmd = target_cmd;
            payload->arg1 = 0;
            payload->data_size = 0;
            char *cursor = payload->buffer;

            for (int i = 0; i + step - 1 < p_count; i += step) {
                int v_len = resolved_path_length(cwd, argv[i]);
                if (v_len < 0) { exit_code = 3; continue; }
                if (!v_len) { exit_code = 3; continue; }

                int r_len = 0;
                if (action == ACTION_RULE_ADD && !is_whiteout) {
                    r_len = resolved_path_length(cwd, argv[i+1]);
                    if (r_len < 0) { exit_code = 3; continue; }
                    if (!r_len) { exit_code = 3; continue; }
                }

                int header_size = (target_cmd == NM_CMD_ADD_RULE) ? sizeof(struct nm_rule_hdr) : sizeof(struct nm_del_hdr);
                int record_size = header_size + v_len + r_len;
                if (record_size > sizeof(payload->buffer)) { exit_code = 3; continue; }
                if ((cursor - payload->buffer) + record_size > sizeof(payload->buffer)) {
                    payload->data_size = cursor - payload->buffer;
                    exit_code |= (nm_send_payload(payload) < 0);
                    cursor = payload->buffer;
                    payload->arg1 = 0;
                }

                if (target_cmd == NM_CMD_ADD_RULE) {
                    struct nm_rule_hdr *h = (void *)cursor;
                    h->flags = (is_whiteout) ? 4 : 0; h->uid = target_uid;
                    h->v_len = v_len; h->r_len = r_len;

                    cursor = resolve_path(cursor + sizeof(*h), v_len, cwd, argv[i]);
                    if (r_len > 0) cursor = resolve_path(cursor, r_len, cwd, argv[i+1]);
                } else {
                    struct nm_del_hdr *h = (void *)cursor;
                    h->uid = target_uid; h->v_len = v_len;

                    cursor = resolve_path(cursor + sizeof(*h), v_len, cwd, argv[i]);
                }
            }

            if (cursor > payload->buffer) {
                payload->data_size = cursor - payload->buffer;
                exit_code |= (nm_send_payload(payload) < 0);
            }
            break;
        }

        case ACTION_UID_ADD:
        case ACTION_UID_DEL: {
            if (p_count < 1) goto do_exit;
            payload->cmd = (action == ACTION_UID_ADD) ? NM_CMD_ADD_UID : NM_CMD_DEL_UID;
            exit_code = 0;
            for (int i = 0; i < p_count; i++) {
                unsigned int uid = 0;
                const char *s = argv[i];
                while (*s) uid = (uid << 3) + (uid << 1) + (*s++ - '0');
                payload->target_uid = uid;
                exit_code |= (nm_send_payload(payload) < 0);
            }
            break;
        }

        case ACTION_CLEAR_ALL: {
            payload->cmd = NM_CMD_CLEAR_ALL;
            exit_code = (nm_send_payload(payload) < 0);
            break;
        }

        case ACTION_RULE_CLEAR:
        case ACTION_UID_CLEAR: {
            payload->cmd = (action == ACTION_RULE_CLEAR) ? NM_CMD_CLEAR_RULES : NM_CMD_CLEAR_UIDS;
            exit_code = (nm_send_payload(payload) < 0);
            break;
        }

        case ACTION_VERSION: {
            payload->cmd = NM_CMD_GET_VERSION;
            if (nm_send_payload(payload) == 0) {
                payload->buffer[payload->data_size++] = '\n';
                print_strn(payload->buffer, payload->data_size);
                exit_code = 0;
            }
            break;
        }

        case ACTION_RULE_LIST:
        case ACTION_UID_LIST: {
            int is_uids = (action == ACTION_UID_LIST);
            if (is_uids) is_json = 1;
            if (is_json) print_literal("[\n");
            int offset = 2;

            payload->cmd = is_uids ? NM_CMD_GET_UIDS : NM_CMD_GET_LIST;
            payload->arg1 = 0;
            while (1) {
                if (nm_send_payload(payload) < 0 || payload->data_size == 0) break;

                char *data = payload->buffer;
                int pos = 0;
                while (pos < payload->data_size) {
                    if (is_uids) {
                        unsigned int uid = *(unsigned int *)(data + pos);
                        pos += 4;
                        if (offset == 0) print_literal(",\n");
                        print_literal("  "); print_uint(uid);
                        offset = 0;
                    } else {
                        struct nm_rule_hdr *h = (void *)(data + pos);
                        unsigned int flags = h->flags, uid = h->uid;
                        unsigned short vlen = h->v_len, rlen = h->r_len;
                        pos += sizeof(*h);

                        char *v = data + pos; pos += vlen;
                        char *r = data + pos; pos += rlen;
                        int is_white_flag  = (flags & 4);
                        int is_virtual_dir = (flags & 2);

                        if (is_json) {
                            print_literal_offset(",\n  {\n    \"virtual\": \"", offset); offset = 0;
                            print_strn(v, vlen);
                            if (is_white_flag) print_literal("\",\n    \"whiteout\": true");
                            else if (is_virtual_dir) print_literal("\",\n    \"virtual_dir\": true");
                            else { print_literal("\",\n    \"real\": \""); print_strn(r, rlen); print_literal("\""); }
                            if (uid != 0) { print_literal(",\n    \"uid\": "); print_uint(uid); }
                            print_literal("\n  }");
                        } else {
                            print_strn(v, vlen);
                            if (is_white_flag) print_literal(" (whiteout)");
                            else if (is_virtual_dir) print_literal(" (virtual dir)");
                            else { print_literal(" -> "); print_strn(r, rlen); }
                            if (uid != 0) { print_literal(" [UID: "); print_uint(uid); print_literal("]"); }
                            print_literal("\n");
                        }
                    }
                }
            }

            if (is_json) print_literal("\n]\n");
            exit_code = 0;
            break;
        }

        case ACTION_NONE:
        default: {
            print_literal("Usage:\n"
                      "  nm rule {add, del, list, clear}\n"
                      "  nm uid {add, del, list, clear}\n"
                      "  nm clear all\n");
            exit_code = 1;
            break;
        }
    }

do_exit:
    sys1(SYS_EXIT, exit_code);
    __builtin_unreachable();
}
