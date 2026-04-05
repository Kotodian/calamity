use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Write a length-prefixed frame: [4 bytes u32 BE length] [payload].
pub async fn write_frame<W: AsyncWriteExt + Unpin>(
    writer: &mut W,
    payload: &[u8],
) -> Result<(), String> {
    let len = payload.len() as u32;
    writer
        .write_all(&len.to_be_bytes())
        .await
        .map_err(|e| format!("write frame length: {e}"))?;
    writer
        .write_all(payload)
        .await
        .map_err(|e| format!("write frame payload: {e}"))?;
    writer
        .flush()
        .await
        .map_err(|e| format!("flush: {e}"))?;
    Ok(())
}

/// Read a length-prefixed frame. Returns the payload bytes.
/// Returns Ok(None) on clean EOF (peer closed connection).
pub async fn read_frame<R: AsyncReadExt + Unpin>(
    reader: &mut R,
) -> Result<Option<Vec<u8>>, String> {
    let mut len_buf = [0u8; 4];
    match reader.read_exact(&mut len_buf).await {
        Ok(_) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(format!("read frame length: {e}")),
    }

    let len = u32::from_be_bytes(len_buf) as usize;
    if len > 16 * 1024 * 1024 {
        return Err(format!("frame too large: {len} bytes"));
    }

    let mut payload = vec![0u8; len];
    reader
        .read_exact(&mut payload)
        .await
        .map_err(|e| format!("read frame payload: {e}"))?;

    Ok(Some(payload))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn frame_roundtrip() {
        let payload = b"hello world";
        let mut buf = Vec::new();
        write_frame(&mut buf, payload).await.unwrap();

        // Verify wire format: 4 byte length + payload
        assert_eq!(buf.len(), 4 + payload.len());
        assert_eq!(&buf[..4], &(payload.len() as u32).to_be_bytes());

        let mut cursor = &buf[..];
        let result = read_frame(&mut cursor).await.unwrap().unwrap();
        assert_eq!(result, payload);
    }

    #[tokio::test]
    async fn frame_roundtrip_empty_payload() {
        let mut buf = Vec::new();
        write_frame(&mut buf, b"").await.unwrap();
        assert_eq!(buf.len(), 4);

        let mut cursor = &buf[..];
        let result = read_frame(&mut cursor).await.unwrap().unwrap();
        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn read_frame_returns_none_on_eof() {
        let buf: &[u8] = &[];
        let mut cursor = buf;
        let result = read_frame(&mut cursor).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn read_frame_rejects_oversized() {
        // Create a frame claiming to be 32MB
        let len_bytes = (32u32 * 1024 * 1024).to_be_bytes();
        let mut cursor = &len_bytes[..];
        let result = read_frame(&mut cursor).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too large"));
    }

    #[tokio::test]
    async fn multiple_frames_roundtrip() {
        let mut buf = Vec::new();
        write_frame(&mut buf, b"first").await.unwrap();
        write_frame(&mut buf, b"second").await.unwrap();
        write_frame(&mut buf, b"third").await.unwrap();

        let mut cursor = &buf[..];
        assert_eq!(read_frame(&mut cursor).await.unwrap().unwrap(), b"first");
        assert_eq!(read_frame(&mut cursor).await.unwrap().unwrap(), b"second");
        assert_eq!(read_frame(&mut cursor).await.unwrap().unwrap(), b"third");
        assert!(read_frame(&mut cursor).await.unwrap().is_none());
    }
}
