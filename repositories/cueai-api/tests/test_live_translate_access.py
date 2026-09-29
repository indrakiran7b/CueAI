from app.modules.live.access import admin_translate_status, companion_translate_status


def test_companion_user_is_not_forbidden() -> None:
    assert companion_translate_status(authenticated=True) == 200


def test_companion_anonymous_is_unauthorized() -> None:
    assert companion_translate_status(authenticated=False) == 401


def test_normal_user_cannot_use_admin_translate() -> None:
    assert admin_translate_status(authenticated=True, role="User") == 403


def test_admin_translate_allowed() -> None:
    assert admin_translate_status(authenticated=True, role="Admin") == 200
    assert admin_translate_status(authenticated=True, role="Manager") == 200
