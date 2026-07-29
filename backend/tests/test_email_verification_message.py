from app import email_verification


class EmailMessageSettings:
    email_code_expire_minutes = 10
    smtp_from_email = "noreply@example.com"
    smtp_from_name = "OMELET Lab"
    smtp_username = "smtp-user@example.com"


def test_register_email_message_contains_plain_text_and_html(monkeypatch):
    monkeypatch.setattr(email_verification, "get_settings", lambda: EmailMessageSettings())

    message = email_verification.build_register_email_message("alice@example.com", "968910")

    assert message["From"] == "OMELET Lab <noreply@example.com>"
    assert message["To"] == "alice@example.com"
    assert message["Subject"] == "[OMELET Lab] 邮箱验证码"
    assert message.get_content_type() == "multipart/alternative"

    parts = {part.get_content_type(): part.get_content() for part in message.iter_parts()}
    assert set(parts) == {"text/plain", "text/html"}

    plain_text = parts["text/plain"]
    assert "alice@example.com，您好：" in plain_text
    assert "您的验证码是：" in plain_text
    assert "968910" in plain_text
    assert "验证码将在 10 分钟后失效。" in plain_text
    assert "This email was sent by OMELET Lab. Please do not reply directly." in plain_text

    html = parts["text/html"]
    assert "邮箱验证码" in html
    assert "alice@example.com，您好：" in html
    assert "968910" in html
    assert '验证码将在 <strong style="font-weight:800;">10</strong> 分钟后失效。' in html
    assert "This email was sent by OMELET Lab. Please do not reply directly." in html
    assert "background:#2f8ff0" in html


def test_email_code_html_escapes_user_controlled_values(monkeypatch):
    class EscapedSettings(EmailMessageSettings):
        smtp_from_name = 'OMELET <Lab> & "Data"'

    monkeypatch.setattr(email_verification, "get_settings", lambda: EscapedSettings())

    html = email_verification.build_email_code_html('alice+<tag>&"@example.com', "123456")

    assert "alice+&lt;tag&gt;&amp;&quot;@example.com，您好：" in html
    assert "alice+<tag>" not in html
    assert "OMELET &lt;Lab&gt; &amp; &quot;Data&quot;" in html
    assert 'OMELET <Lab> & "Data"' not in html
