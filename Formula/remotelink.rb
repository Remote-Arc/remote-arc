class Remotelink < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.3"
  conflicts_with "remotelink-go", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-arm64", using: :nounzip
      sha256 "ce937b666734631dae534b0528ff81bebb0914b6fd7a2fb914454a58f730fc36"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-darwin-amd64", using: :nounzip
      sha256 "52067abe67fd42dc4cad13d0472a7c90f8c5cec206f5bcffe497d6954fb819ef"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-arm64", using: :nounzip
      sha256 "93da0313bcd736a6b4e99526344bcb64136d2fca7f6c42bce789d5530feee022"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.3/remotelink-v0.6.3-linux-amd64", using: :nounzip
      sha256 "232a011ca519e18f6ae1d8e6b786f32d84b00d6e78220a6ade3e78f4c8619d8f"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.6.3", shell_output("#{bin}/remotelink --version").strip
  end
end
