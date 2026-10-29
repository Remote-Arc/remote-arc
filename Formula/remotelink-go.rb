class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.5"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.5/remotelink-v0.6.5-darwin-arm64", using: :nounzip
      sha256 "6729f2ef6b8046f5f1b9ea87d0f2db87ae5e3706cecc49d1ef6ff4bf33193348"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.5/remotelink-v0.6.5-darwin-amd64", using: :nounzip
      sha256 "5c31ea092579f8512f00042f74cb55ea93680baa48cd3136f34783e75c93b7d8"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.5/remotelink-v0.6.5-linux-arm64", using: :nounzip
      sha256 "a0e12fa78da6f197ba19ba873bfd49a6870525c7354d036a216e75a10bddf8c6"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.5/remotelink-v0.6.5-linux-amd64", using: :nounzip
      sha256 "c7e0b9bf690c227832ab329062d49ea6df53cfe801c70e0d16955d6662a6d78c"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.6.5", shell_output("#{bin}/remotelink --version").strip
  end
end
